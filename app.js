const NAME_KEY = 'mojito-inn-operator';
const ORDERS_KEY = 'mojito-inn-simple-orders-v1';
const THEME_KEY = 'mojito-inn-theme';
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const config = window.MOJITO_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || '') && !String(config.supabaseKey).startsWith('COLLE_');
const db = configured && window.supabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
let operatorName = localStorage.getItem(NAME_KEY) || '';
let state = { balance: 0, peak: 0, history: [], updated: Date.now() };
let cart = [];
let appMode = 'tab';
let expenses = [];
let savedOrders = loadOrders();
let happyHour = false;

function loadOrders(){try{return JSON.parse(localStorage.getItem(ORDERS_KEY))||[]}catch{return[]}}
function saveOrders(){localStorage.setItem(ORDERS_KEY,JSON.stringify(savedOrders));renderOrderLogs()}
function applyTheme(theme){
  if(theme!=='contrast')theme='sand';document.body.classList.toggle('theme-contrast',theme==='contrast');document.body.dataset.theme=theme;
  const button=document.querySelector('#theme-toggle');button.textContent=theme==='contrast'?'☀️':'🌙';button.setAttribute('aria-label',theme==='contrast'?'Activer le mode clair':'Activer le mode sombre');
}

const format = value => number.format(Number(value));
const parseAmount = value => Number(value.trim().replace(/\s/g, '').replace(',', '.'));
function toast(message) { const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2500); }
function syncStatus(text, kind='') { const el=document.querySelector('#sync-status'); el.className=`sync-status ${kind}`; el.querySelector('span').textContent=text; }
function requireName() { if (operatorName) return true; openName(); return false; }

function render() {
  document.querySelector('#operator-name').textContent = operatorName || 'Choisir mon nom';
  document.querySelector('#balance').textContent = format(state.balance);
  document.querySelector('#updated').textContent = state.history.length ? `Mis à jour à ${new Date(state.updated).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}` : 'Prêt à démarrer';
  document.querySelector('#progress').style.width = `${state.peak ? Math.min(100, state.balance/state.peak*100) : 0}%`;
  document.querySelector('#balance-note').textContent = state.balance ? `${format(Math.max(0,state.peak-state.balance))} déjà déduits de cette ardoise.` : 'L’ardoise est vide — tout est réglé !';
  document.querySelector('#count').textContent = `${state.history.length} opération${state.history.length>1?'s':''}`;
  document.querySelector('#history').innerHTML = state.history.length ? state.history.slice(0,8).map(item=>`
    <li><span class="history-icon ${item.type}">${item.type==='add'?'+':'−'}</span>
    <span class="history-info"><b>${item.type==='add'?'Ajout à l’ardoise':`${item.quantity>1?item.quantity+' × ':''}${item.name}`}</b><small>${item.operator} · ${new Date(item.date).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span>
    <span class="history-amount ${item.type}">${item.type==='add'?'+':'−'} ${format(item.amount)}</span></li>`).join('') : '<li class="empty">Aucune opération pour le moment 🌺</li>';
}

function renderCart() {
  const total=cart.reduce((sum,item)=>sum+item.amount,0);
  document.querySelector('#cart-total').textContent=format(total);
  document.querySelector('#cart-count').textContent=cart.length?`${cart.length} article${cart.length>1?'s':''}`:'Aucun article';
  const counts=new Map(); cart.forEach(item=>{const key=`${item.name}|${item.amount}`; const old=counts.get(key)||{...item,qty:0}; old.qty++; counts.set(key,old)});
  document.querySelector('#cart-lines').innerHTML=[...counts.values()].map(item=>`<li><span>${item.qty} × ${item.name}</span><span>${format(item.qty*item.amount)}</span></li>`).join('');
  document.querySelector('#validate-cart').disabled=!cart.length;
  document.querySelector('#validate-cart').textContent=appMode==='tab'?'Valider et déduire':'Commande encaissée';
  document.querySelector('#undo-item').disabled=!cart.length; document.querySelector('#clear-cart').disabled=!cart.length;
}

function renderExpenses(){
  const total=expenses.reduce((sum,item)=>sum+item.amount,0);
  document.querySelector('#expense-total').textContent=format(total);
  document.querySelector('#expense-count').textContent=`${expenses.length} dépense${expenses.length>1?'s':''}`;
  document.querySelector('#expense-history').innerHTML=expenses.length?expenses.map(item=>`<li><span class="history-icon add">−</span><span class="history-info"><b>${item.label}</b><small>${item.category} · ${item.operator} · ${new Date(item.date).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span><span class="history-amount">− ${format(item.amount)}</span></li>`).join(''):'<li class="empty">Aucune dépense enregistrée 🌺</li>';
}

function renderOrderLogs(){
  const revenue=savedOrders.reduce((sum,order)=>sum+order.total,0),itemCount=savedOrders.reduce((sum,order)=>sum+order.items.length,0);
  document.querySelector('#order-revenue').textContent=format(revenue);
  document.querySelector('#order-items').textContent=format(itemCount);
  document.querySelector('#order-count').textContent=format(savedOrders.length);
  document.querySelector('#saved-orders-count').textContent=`${savedOrders.length} commande${savedOrders.length>1?'s':''}`;
  const products=new Map();savedOrders.forEach(order=>order.items.forEach(item=>{const label=item.logName||item.name,old=products.get(label)||{qty:0,total:0};old.qty++;old.total+=item.amount;products.set(label,old)}));
  document.querySelector('#sales-summary').innerHTML=products.size?[...products.entries()].sort((a,b)=>b[1].qty-a[1].qty).map(([name,data])=>`<li><span>${name}</span><b>${data.qty} · ${format(data.total)}</b></li>`).join(''):'<li class="empty">Aucune vente</li>';
  document.querySelector('#order-history').innerHTML=savedOrders.length?savedOrders.slice(0,30).map(order=>{const grouped=new Map();order.items.forEach(item=>{const label=item.logName||item.name;grouped.set(label,(grouped.get(label)||0)+1)});const detail=[...grouped.entries()].map(([name,qty])=>`${qty} × ${name}`).join(', ');return `<li><span class="history-icon">✓</span><span class="history-info"><b>${detail}</b><small>${order.operator||'Sans nom'} · ${new Date(order.date).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span><span class="history-amount">${format(order.total)}</span></li>`}).join(''):'<li class="empty">Aucune commande enregistrée</li>';
}

function addToCart(amount,name,logName=name){ if(appMode==='tab'&&!requireName())return; cart.push({amount,name,logName}); renderCart(); toast(`${name} ajouté · total ${format(cart.reduce((s,x)=>s+x.amount,0))}`); }

function setAppMode(next){
  appMode=next; cart=[];
  document.body.classList.toggle('order-mode',appMode==='order');
  document.body.classList.toggle('expenses-mode',appMode==='expenses');
  document.querySelectorAll('[data-app-mode]').forEach(button=>button.classList.toggle('active',button.dataset.appMode===appMode));
  document.querySelector('.section-heading small').textContent=appMode==='tab'?'Touchez pour ajouter au panier':'Calcule la commande sans toucher à l’ardoise';
  renderCart(); toast(appMode==='tab'?'Mode ardoise partagé':appMode==='order'?'Mode commande simple':'Suivi des dépenses');
}
document.querySelectorAll('[data-app-mode]').forEach(button=>button.addEventListener('click',()=>setAppMode(button.dataset.appMode)));
document.querySelector('#theme-toggle').addEventListener('click',()=>{const next=document.body.classList.contains('theme-contrast')?'sand':'contrast';localStorage.setItem(THEME_KEY,next);applyTheme(next)});

async function refresh() {
  if (!db) { syncStatus('Configuration Supabase requise', 'error'); render(); return; }
  const [balanceResult, logsResult, expensesResult] = await Promise.all([
    db.from('ardoise_state').select('balance,peak,updated_at').eq('id',1).single(),
    db.from('ardoise_logs').select('operation,amount,quantity,item_name,operator_name,created_at').order('created_at',{ascending:false}).limit(50),
    db.from('depenses').select('label,category,amount,operator_name,created_at').order('created_at',{ascending:false}).limit(100)
  ]);
  if (balanceResult.error || logsResult.error) { syncStatus('Connexion impossible', 'error'); toast('Vérifie la configuration Supabase'); return; }
  const row=balanceResult.data;
  state={ balance:Number(row.balance), peak:Number(row.peak), updated:new Date(row.updated_at).getTime(), history:logsResult.data.map(x=>({type:x.operation,amount:Number(x.amount),quantity:Number(x.quantity||1),name:x.item_name,operator:x.operator_name,date:new Date(x.created_at).getTime()})) };
  expenses=expensesResult.error?[]:expensesResult.data.map(x=>({label:x.label,category:x.category,amount:Number(x.amount),operator:x.operator_name,date:new Date(x.created_at).getTime()}));
  syncStatus('Ardoise partagée · en direct','online'); render();renderExpenses();
}

async function addTransaction(type, amount, name) {
  if (!requireName()) return;
  if (!db) return toast('Branche d’abord la base Supabase');
  if (type==='payment' && amount>state.balance) return toast(`Solde insuffisant : il reste ${format(state.balance)}`);
  const { error }=await db.rpc('appliquer_operation',{p_operation:type,p_amount:amount,p_item_name:name,p_operator_name:operatorName});
  if (error) return toast(error.message.includes('Solde insuffisant')?'Le solde vient de changer : montant insuffisant':'Opération non enregistrée');
  await refresh(); toast(type==='add'?`${format(amount)} ajoutés par ${operatorName} 🌺`:`${name} · − ${format(amount)} ✓`);
}

function updateMenuPrices(){
  document.querySelectorAll('.product[data-normal]').forEach(button=>{const price=happyHour&&button.dataset.happy?button.dataset.happy:button.dataset.normal;button.dataset.price=price;button.querySelector('strong').textContent=price});
  const dynamic=document.querySelectorAll('.dynamic-price');if(dynamic[0])dynamic[0].textContent=happyHour?'350':'450';if(dynamic[1])dynamic[1].textContent=happyHour?'300':'400';
  const toggle=document.querySelector('#happy-toggle');toggle.classList.toggle('active',happyHour);toggle.setAttribute('aria-pressed',happyHour);document.querySelector('#happy-state').textContent=happyHour?'Happy hour · 21h–22h':'Prix classiques';
}
document.querySelector('#happy-toggle').addEventListener('click',()=>{happyHour=!happyHour;updateMenuPrices();toast(happyHour?'Happy hour activé 🌅':'Prix classiques activés')});
document.querySelectorAll('[data-menu-view]').forEach(button=>button.addEventListener('click',()=>{const detailed=button.dataset.menuView==='detailed';document.querySelector('#simple-menu').hidden=detailed;document.querySelector('#detailed-menu').hidden=!detailed;document.querySelectorAll('[data-menu-view]').forEach(item=>item.classList.toggle('active',item===button))}));
document.querySelectorAll('.product').forEach(button=>button.addEventListener('click',()=>addToCart(Number(button.dataset.price),button.dataset.name,button.dataset.logName||button.dataset.name)));
document.querySelector('#custom-form').addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#custom-amount');const amount=parseAmount(input.value);if(!Number.isFinite(amount)||amount<=0)return toast('Entre un montant libre supérieur à zéro');addToCart(amount,'Montant libre');input.value=''});
document.querySelector('#undo-item').addEventListener('click',()=>{const item=cart.pop();renderCart();if(item)toast(`${item.name} retiré du panier`)});
document.querySelector('#clear-cart').addEventListener('click',()=>{cart=[];renderCart();toast('Panier vidé')});
document.querySelector('#validate-cart').addEventListener('click',async()=>{
  if(!cart.length)return;
  const total=cart.reduce((s,x)=>s+x.amount,0);
  if(appMode==='order'){savedOrders.unshift({total,items:cart.slice(),operator:operatorName||'Sans nom',date:Date.now()});if(savedOrders.length>200)savedOrders.length=200;saveOrders();cart=[];renderCart();toast(`Commande de ${format(total)} encaissée ✓`);return}
  if(!requireName()||!db){if(!db)toast('Branche d’abord la base Supabase');return}
  if(total>state.balance)return toast(`Total ${format(total)} · il reste seulement ${format(state.balance)}`);
  const pending=cart.map(item=>({...item,name:item.logName||item.name})); document.querySelector('#validate-cart').disabled=true;
  const {error}=await db.rpc('appliquer_panier',{p_items:pending,p_operator_name:operatorName});
  if(error){renderCart();return toast(error.message.includes('Solde insuffisant')?'Le solde vient de changer : total insuffisant':'Panier non enregistré')}
  cart=[];renderCart();await refresh();toast(`Panier de ${format(total)} validé ✓`);
});
const addModal=document.querySelector('#add-modal');
document.querySelector('#open-add').addEventListener('click',()=>{ if(!requireName())return; addModal.showModal(); setTimeout(()=>document.querySelector('#add-amount').focus(),50); });
document.querySelector('#close-add').addEventListener('click',()=>addModal.close());
addModal.addEventListener('click',e=>{if(e.target===addModal)addModal.close()});
document.querySelector('#add-form').addEventListener('submit',async e=>{ e.preventDefault(); const input=document.querySelector('#add-amount'); const amount=parseAmount(input.value); if(!Number.isFinite(amount)||amount<=0)return toast('Entre un montant supérieur à zéro'); addModal.close(); input.value=''; await addTransaction('add',amount,'Ajout à l’ardoise'); });

const nameModal=document.querySelector('#name-modal');
function openName(){ document.querySelector('#name-input').value=operatorName; nameModal.showModal(); setTimeout(()=>document.querySelector('#name-input').focus(),50); }
document.querySelector('#open-name').addEventListener('click',openName);
document.querySelector('#close-name').addEventListener('click',()=>nameModal.close());
document.querySelector('#name-form').addEventListener('submit',e=>{ e.preventDefault(); const value=document.querySelector('#name-input').value.trim(); if(!value)return; operatorName=value.slice(0,30); localStorage.setItem(NAME_KEY,operatorName); nameModal.close(); render(); toast(`Bienvenue ${operatorName} !`); });

document.querySelector('#reset').addEventListener('click',async()=>{ if(!requireName()||!db)return; if(confirm('Remettre l’ardoise partagée et tous ses logs à zéro ?')){ const {error}=await db.rpc('remettre_ardoise_a_zero'); if(error){console.error(error);return toast(`Remise à zéro impossible : ${error.message}`)} await refresh(); toast('Ardoise remise à zéro'); } });
document.querySelector('#expense-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!requireName()||!db){if(!db)toast('Branche d’abord la base Supabase');return}
  const label=document.querySelector('#expense-label').value.trim(),category=document.querySelector('#expense-category').value,amount=parseAmount(document.querySelector('#expense-amount').value);
  if(!label||!Number.isFinite(amount)||amount<=0)return toast('Indique un achat et un montant valide');
  const {error}=await db.rpc('ajouter_depense',{p_label:label,p_category:category,p_amount:amount,p_operator_name:operatorName});
  if(error)return toast(`Dépense non enregistrée : ${error.message}`);
  e.target.reset();await refresh();toast(`Dépense de ${format(amount)} enregistrée ✓`);
});
document.querySelector('#reset-expenses').addEventListener('click',async()=>{
  if(!requireName()||!db)return;if(!confirm('Effacer tout l’historique des dépenses ?'))return;
  const {error}=await db.rpc('remettre_depenses_a_zero');if(error)return toast(`Remise à zéro impossible : ${error.message}`);await refresh();toast('Dépenses remises à zéro');
});
document.querySelector('#reset-orders').addEventListener('click',()=>{if(!savedOrders.length)return;if(confirm('Effacer les commandes et le récapitulatif enregistrés sur cet appareil ?')){savedOrders=[];saveOrders();toast('Historique des commandes remis à zéro')}});
if(db){ db.channel('mojito-inn-live').on('postgres_changes',{event:'*',schema:'public',table:'ardoise_state'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'ardoise_logs'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'depenses'},refresh).subscribe(status=>{if(status==='SUBSCRIBED')syncStatus('Ardoise partagée · en direct','online')}); }
updateMenuPrices();applyTheme(localStorage.getItem(THEME_KEY)||'sand');render(); renderCart();renderExpenses();renderOrderLogs(); refresh(); if(!operatorName)setTimeout(openName,250);
