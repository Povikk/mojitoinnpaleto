import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
const clean=(value:unknown)=>String(value||'').trim();
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,authorization=request.headers.get('authorization')||'';
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}}),admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
 const{data:{user},error:userError}=await userClient.auth.getUser();if(userError||!user)return json({error:'Connexion requise'},401);
 const{data:profile}=await admin.from('employee_profiles').select('role,active').eq('user_id',user.id).maybeSingle();if(!profile?.active||profile.role!=='admin')return json({error:'Action réservée aux administrateurs'},403);
 if(request.method==='GET'){const{data,error}=await admin.from('employee_profiles').select('user_id,username,display_name,role,active,last_seen_at,created_at').order('display_name');return error?json({error:error.message},400):json({accounts:data})}
 const body=await request.json().catch(()=>({})),action=clean(body.action);
 if(action==='create'){
  const username=clean(body.username).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9._-]/g,''),displayName=clean(body.displayName).slice(0,30),password=clean(body.password),role=body.role==='admin'?'admin':'employee';
  if(username.length<2||!displayName||password.length<6)return json({error:'Identifiant, nom ou mot de passe invalide'},400);
  const{data,error}=await admin.auth.admin.createUser({email:`${username}@staff.mojito-inn.fr`,password,email_confirm:true});if(error)return json({error:error.message},400);
  const saved=await admin.from('employee_profiles').upsert({user_id:data.user.id,username,display_name:displayName,role,active:true});if(saved.error){await admin.auth.admin.deleteUser(data.user.id);return json({error:saved.error.message},400)}return json({ok:true});
 }
 const userId=clean(body.userId);if(!userId)return json({error:'Compte manquant'},400);
 if(userId===user.id&&((action==='toggle'&&!body.active)||(action==='role'&&body.role!=='admin')))return json({error:'Tu ne peux pas retirer ton propre accès administrateur'},400);
 if(action==='toggle'){const update=await admin.from('employee_profiles').update({active:Boolean(body.active)}).eq('user_id',userId);return update.error?json({error:update.error.message},400):json({ok:true})}
 if(action==='role'){const update=await admin.from('employee_profiles').update({role:body.role==='admin'?'admin':'employee'}).eq('user_id',userId);return update.error?json({error:update.error.message},400):json({ok:true})}
 if(action==='password'){const password=clean(body.password);if(password.length<6)return json({error:'6 caractères minimum'},400);const update=await admin.auth.admin.updateUserById(userId,{password});return update.error?json({error:update.error.message},400):json({ok:true})}
 return json({error:'Action inconnue'},400);
});

