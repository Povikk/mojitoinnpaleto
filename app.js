const NAME_KEY = 'mojito-inn-operator';
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const config = window.MOJITO_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || '') && !String(config.supabaseKey).startsWith('COLLE_');
const db = configured && window.supabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
let operatorName = localStorage.getItem(NAME_KEY) || '';
let state = { balance: 0, peak: 0, history: [], updated: Date.now() };
let cart = [];

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
    <span class="history-info"><b>${item.type==='add'?'Ajout à l’ardoise':item.name}</b><small>${item.operator} · ${new Date(item.date).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span>
    <span class="history-amount ${item.type}">${item.type==='add'?'+':'−'} ${format(item.amount)}</span></li>`).join('') : '<li class="empty">Aucune opération pour le moment 🌺</li>';
}

function renderCart() {
  const total=cart.reduce((sum,item)=>sum+item.amount,0);
  document.querySelector('#cart-total').textContent=format(total);
  document.querySelector('#cart-count').textContent=cart.length?`${cart.length} article${cart.length>1?'s':''}`:'Aucun article';
  const counts=new Map(); cart.forEach(item=>{const key=`${item.name}|${item.amount}`; const old=counts.get(key)||{...item,qty:0}; old.qty++; counts.set(key,old)});
  document.querySelector('#cart-lines').innerHTML=[...counts.values()].map(item=>`<li><span>${item.qty} × ${item.name}</span><span>${format(item.qty*item.amount)}</span></li>`).join('');
  document.querySelector('#validate-cart').disabled=!cart.length;
  document.querySelector('#undo-item').disabled=!cart.length; document.querySelector('#clear-cart').disabled=!cart.length;
}

function addToCart(amount,name){ if(!requireName())return; cart.push({amount,name}); renderCart(); toast(`${name} ajouté · total ${format(cart.reduce((s,x)=>s+x.amount,0))}`); }

async function refresh() {
  if (!db) { syncStatus('Configuration Supabase requise', 'error'); render(); return; }
  const [balanceResult, logsResult] = await Promise.all([
    db.from('ardoise_state').select('balance,peak,updated_at').eq('id',1).single(),
    db.from('ardoise_logs').select('operation,amount,item_name,operator_name,created_at').order('created_at',{ascending:false}).limit(50)
  ]);
  if (balanceResult.error || logsResult.error) { syncStatus('Connexion impossible', 'error'); toast('Vérifie la configuration Supabase'); return; }
  const row=balanceResult.data;
  state={ balance:Number(row.balance), peak:Number(row.peak), updated:new Date(row.updated_at).getTime(), history:logsResult.data.map(x=>({type:x.operation,amount:Number(x.amount),name:x.item_name,operator:x.operator_name,date:new Date(x.created_at).getTime()})) };
  syncStatus('Ardoise partagée · en direct','online'); render();
}

async function addTransaction(type, amount, name) {
  if (!requireName()) return;
  if (!db) return toast('Branche d’abord la base Supabase');
  if (type==='payment' && amount>state.balance) return toast(`Solde insuffisant : il reste ${format(state.balance)}`);
  const { error }=await db.rpc('appliquer_operation',{p_operation:type,p_amount:amount,p_item_name:name,p_operator_name:operatorName});
  if (error) return toast(error.message.includes('Solde insuffisant')?'Le solde vient de changer : montant insuffisant':'Opération non enregistrée');
  await refresh(); toast(type==='add'?`${format(amount)} ajoutés par ${operatorName} 🌺`:`${name} · − ${format(amount)} ✓`);
}

document.querySelectorAll('.product').forEach(button=>button.addEventListener('click',()=>addToCart(Number(button.dataset.price),button.dataset.name)));
document.querySelector('#custom-form').addEventListener('submit',e=>{e.preventDefault();const input=document.querySelector('#custom-amount');const amount=parseAmount(input.value);if(!Number.isFinite(amount)||amount<=0)return toast('Entre un montant libre supérieur à zéro');addToCart(amount,'Montant libre');input.value=''});
document.querySelector('#undo-item').addEventListener('click',()=>{const item=cart.pop();renderCart();if(item)toast(`${item.name} retiré du panier`)});
document.querySelector('#clear-cart').addEventListener('click',()=>{cart=[];renderCart();toast('Panier vidé')});
document.querySelector('#validate-cart').addEventListener('click',async()=>{
  if(!requireName()||!db||!cart.length){if(!db)toast('Branche d’abord la base Supabase');return}
  const total=cart.reduce((s,x)=>s+x.amount,0); if(total>state.balance)return toast(`Total ${format(total)} · il reste seulement ${format(state.balance)}`);
  const pending=cart.slice(); document.querySelector('#validate-cart').disabled=true;
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
document.querySelector('#close-name').addEventListener('click',()=>{if(operatorName)nameModal.close()});
document.querySelector('#name-form').addEventListener('submit',e=>{ e.preventDefault(); const value=document.querySelector('#name-input').value.trim(); if(!value)return; operatorName=value.slice(0,30); localStorage.setItem(NAME_KEY,operatorName); nameModal.close(); render(); toast(`Bienvenue ${operatorName} !`); });

document.querySelector('#reset').addEventListener('click',async()=>{ if(!requireName()||!db)return; if(confirm('Remettre l’ardoise partagée et tous ses logs à zéro ?')){ const {error}=await db.rpc('remettre_ardoise_a_zero'); if(error){console.error(error);return toast(`Remise à zéro impossible : ${error.message}`)} await refresh(); toast('Ardoise remise à zéro'); } });
if(db){ db.channel('mojito-inn-live').on('postgres_changes',{event:'*',schema:'public',table:'ardoise_state'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'ardoise_logs'},refresh).subscribe(status=>{if(status==='SUBSCRIBED')syncStatus('Ardoise partagée · en direct','online')}); }
render(); renderCart(); refresh(); if(!operatorName)setTimeout(openName,250);
