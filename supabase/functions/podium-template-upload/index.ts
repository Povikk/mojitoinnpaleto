import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set(['https://povikk.github.io', 'null']);
function corsHeaders(origin: string | null) {
  const allowed = origin && (allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://povikk.github.io',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async request => {
  const origin=request.headers.get('origin'),cors=corsHeaders(origin);
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:'Méthode refusée'},405);
  if(origin&&!allowedOrigins.has(origin)&&!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return json({error:'Origine refusée'},403);
  try {
    const form=await request.formData(),file=form.get('file'),password=String(form.get('password')||''),operator=String(form.get('operator')||'').trim();
    if(!(file instanceof File))return json({error:'Fichier vidéo manquant'},400);
    if(!['kai','summer'].includes(operator.toLowerCase()))return json({error:'Action réservée à Kai et Summer'},403);
    if(!['video/mp4','video/webm'].includes(file.type))return json({error:'Choisis une vidéo MP4 ou WebM'},400);
    if(file.size>50*1024*1024)return json({error:'Le modèle dépasse 50 Mo'},413);
    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!serviceKey)throw new Error('Secrets Supabase indisponibles');
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}}),{data:valid,error:verifyError}=await admin.rpc('verifier_acces_application',{p_password:password});
    if(verifyError)throw verifyError;
    if(!valid)return json({error:'Mot de passe incorrect'},401);
    const path='current/podium-template',{error:uploadError}=await admin.storage.from('podium-templates').upload(path,file,{contentType:file.type,upsert:true,cacheControl:'60'});
    if(uploadError)throw uploadError;
    const publicUrl=admin.storage.from('podium-templates').getPublicUrl(path).data.publicUrl,version=crypto.randomUUID();
    const{error:configError}=await admin.from('podium_template_config').upsert({id:1,public_url:publicUrl,mime_type:file.type,file_size:file.size,version,updated_at:new Date().toISOString(),updated_by:operator});
    if(configError)throw configError;
    return json({url:`${publicUrl}?v=${encodeURIComponent(version)}`,version,updatedBy:operator,size:file.size});
  } catch(error) {
    console.error('Podium template upload:',error);
    return json({error:error instanceof Error?error.message:'Envoi impossible'},500);
  }
});

