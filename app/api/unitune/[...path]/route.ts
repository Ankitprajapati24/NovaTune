import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { parseMusicLink, validTracks } from "@/lib/music";
export const dynamic="force-dynamic";
class HttpError extends Error{constructor(message:string,public status=400){super(message);}}
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"no-store"}});
function db(){if(!env.DB)throw new HttpError("Saving is temporarily unavailable. Please try again.",503);return env.DB;}
async function owner(){const u=await getChatGPTUser();if(!u)throw new HttpError("Sign in to save playlists, photos or create a room.",401);return u.userId;}
async function body(r:Request){const t=await r.text();if(t.length>80000)throw new HttpError("This request is too large.",413);try{return JSON.parse(t);}catch{throw new HttpError("Invalid request.");}}
const newId=()=>crypto.randomUUID().replaceAll("-","");
const validId=(id:string)=>{if(!/^[a-f0-9]{32}$/.test(id))throw new HttpError("This link is invalid.",404);return id;};
function sameOrigin(r:Request){if(r.headers.get("origin")!==new URL(r.url).origin)throw new HttpError("Please make this change from the Novatune page.",403);}
async function google(endpoint:string,params:Record<string,string>){
 if(!env.YOUTUBE_API_KEY)throw new HttpError("YouTube search needs to be connected. You can still paste a song or playlist link.",503);
 const u=new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);u.search=new URLSearchParams({...params,key:env.YOUTUBE_API_KEY}).toString();
 const r=await fetch(u,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new HttpError(r.status===403?"YouTube search is unavailable or its daily limit was reached. Paste a direct music link instead.":"YouTube could not load these results. Try again.",502);return await r.json() as any;
}
async function roomData(id:string){const room=await db().prepare("SELECT * FROM rooms WHERE id = ?").bind(validId(id)).first<any>();if(!room)throw new HttpError("This room has ended or the link is incorrect.",404);return room;}
async function route(r:Request){
 const u=new URL(r.url),path=u.pathname.split("/api/unitune/")[1]?.split("/")||[],method=r.method;
 if(method!=="GET")sameOrigin(r);
 if(path[0]==="config"&&method==="GET"){const user=await getChatGPTUser();return json({signedIn:!!user,name:user?.displayName,spotifyClientId:env.SPOTIFY_CLIENT_ID||"",youtubeSearch:!!env.YOUTUBE_API_KEY});}
 if(path[0]==="resolve"&&method==="GET"){
  const track=parseMusicLink(u.searchParams.get("url")||"");
  if(track.provider==="youtube"){
   if(track.kind==="track")try{const q=new URLSearchParams({url:track.url,format:"json"});const response=await fetch(`https://www.youtube.com/oembed?${q}`,{signal:AbortSignal.timeout(6000)});if(response.ok){const data=await response.json() as any;track.title=data.title||track.title;track.artist=data.author_name||track.artist;}}catch{}
   if(track.kind==="playlist"&&env.YOUTUBE_API_KEY){const items:any[]=[];let pageToken="";do{const data=await google("playlistItems",{part:"snippet",playlistId:track.id,maxResults:"50",...(pageToken?{pageToken}:{})});items.push(...(data.items||[]));pageToken=data.nextPageToken||"";}while(pageToken&&items.length<500);return json({track,items:items.filter((x:any)=>x.snippet.resourceId.videoId).map((x:any)=>({provider:"youtube",kind:"track",id:x.snippet.resourceId.videoId,title:x.snippet.title,artist:x.snippet.videoOwnerChannelTitle||"YouTube",url:`https://www.youtube.com/watch?v=${x.snippet.resourceId.videoId}`})),more:!!pageToken});}
  }return json({track});
 }
 if(path[0]==="search"&&method==="GET"){const q=(u.searchParams.get("q")||"").trim();if(q.length<2||q.length>100)throw new HttpError("Enter between 2 and 100 characters.");const data=await google("search",{part:"snippet",q,type:"video",videoEmbeddable:"true",maxResults:"10"});return json({tracks:data.items.map((x:any)=>({provider:"youtube",kind:"track",id:x.id.videoId,title:x.snippet.title,artist:x.snippet.channelTitle,url:`https://www.youtube.com/watch?v=${x.id.videoId}`}))});}
 if(path[0]==="library"){
  const me=await owner();if(method==="GET"){const row=await db().prepare("SELECT data FROM libraries WHERE owner = ?").bind(me).first<{data:string}>();return json(row?JSON.parse(row.data):{playlists:[],liked:[]});}
  if(method==="PUT"){const b=await body(r);if(!Array.isArray(b.playlists)||b.playlists.length>20)throw new HttpError("Keep up to 20 Novatune playlists.");const data={playlists:b.playlists.map((p:any)=>({id:String(p.id).slice(0,50),name:String(p.name).slice(0,80),tracks:validTracks(p.tracks)})),liked:validTracks(b.liked||[])};await db().prepare("INSERT INTO libraries(owner,data,updated) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data,updated=excluded.updated").bind(me,JSON.stringify(data),Date.now()).run();return json(data);}
 }
 if(path[0]==="photos"){
  if(method==="POST"){
   const me=await owner();if(!env.BUCKET)throw new HttpError("Photo storage is unavailable. Please try again.",503);
   if(Number(r.headers.get("content-length")||0)>3500000)throw new HttpError("Choose a photo smaller than 3 MB.",413);
   const count=await db().prepare("SELECT COUNT(*) AS n FROM photos WHERE owner = ?").bind(me).first<{n:number}>();if((count?.n||0)>=20)throw new HttpError("Remove an old photo before uploading another.");
   const form=await r.formData(),file=form.get("photo");if(!file||typeof file==="string"||file.size>3000000||!file.size)throw new HttpError("Choose a JPG, PNG or WebP photo under 3 MB.");
   const data=await file.arrayBuffer(),bytes=new Uint8Array(data);let mime="";if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime="image/jpeg";else if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))mime="image/png";else if(new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP")mime="image/webp";if(!mime)throw new HttpError("Choose a valid JPG, PNG or WebP photo.");
   const id=newId();await env.BUCKET.put(id,data,{httpMetadata:{contentType:mime}});try{await db().prepare("INSERT INTO photos(id,owner,mime,created) VALUES(?,?,?,?)").bind(id,me,mime,Date.now()).run();}catch(e){await env.BUCKET.delete(id);throw e;}return json({id,url:`/api/unitune/photos/${id}`},201);
  }
  if(method==="GET"&&path[1]){const id=validId(path[1]);const row=await db().prepare("SELECT mime FROM photos WHERE id = ?").bind(id).first<{mime:string}>();const object=row&&await env.BUCKET?.get(id);if(!object)throw new HttpError("Photo no longer available.",404);return new Response(object.body,{headers:{"Content-Type":row!.mime,"X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=60"}});}
  if(method==="DELETE"&&path[1]){const me=await owner(),id=validId(path[1]);const row=await db().prepare("SELECT id FROM photos WHERE id = ? AND owner = ?").bind(id,me).first();if(!row)throw new HttpError("Photo not found.",404);await env.BUCKET?.delete(id);await db().prepare("DELETE FROM photos WHERE id = ? AND owner = ?").bind(id,me).run();return json({deleted:true});}
 }
 if(path[0]==="shares"){
  if(method==="GET"&&path[1]){const row=await db().prepare("SELECT data,owner FROM shares WHERE id = ?").bind(validId(path[1])).first<{data:string,owner:string}>();if(!row)throw new HttpError("This dedication is no longer available.",404);const user=await getChatGPTUser();return json({...JSON.parse(row.data),id:path[1],isOwner:row.owner===user?.userId});}
  const me=await owner();
  if(method==="GET"){const rows=await db().prepare("SELECT id,data FROM shares WHERE owner = ? ORDER BY created DESC LIMIT 30").bind(me).all<any>();return json({shares:rows.results.map(x=>({...JSON.parse(x.data),id:x.id}))});}
  if(method==="POST"||method==="PUT"){
   const b=await body(r),tracks=validTracks(b.tracks);if(!tracks.length)throw new HttpError("Add at least one song first.");const photoId=b.photoId?validId(b.photoId):null;
   if(photoId&&!await db().prepare("SELECT id FROM photos WHERE id = ? AND owner = ?").bind(photoId,me).first())throw new HttpError("Please upload your photo again.",403);
   const data={name:String(b.name||"Someone special").trim().slice(0,70),message:String(b.message||"a soundtrack for us.").trim().slice(0,180),photoId,position:Math.max(0,Math.min(100,Number(b.position)||50)),effect:b.effect==="hearts"?"hearts":"stars",tracks};
   if(method==="PUT"){const changed=await db().prepare("UPDATE shares SET data = ? WHERE id = ? AND owner = ?").bind(JSON.stringify(data),validId(path[1]),me).run();if(!changed.meta.changes)throw new HttpError("You cannot edit this dedication.",403);return json({id:path[1],...data});}
   const count=await db().prepare("SELECT COUNT(*) AS n FROM shares WHERE owner = ?").bind(me).first<{n:number}>();if((count?.n||0)>=30)throw new HttpError("Remove an old dedication before creating another.");const id=newId();await db().prepare("INSERT INTO shares(id,owner,data,created) VALUES(?,?,?,?)").bind(id,me,JSON.stringify(data),Date.now()).run();return json({id,...data},201);
  }
  if(method==="DELETE"){await db().prepare("DELETE FROM shares WHERE id = ? AND owner = ?").bind(validId(path[1]),me).run();return json({deleted:true});}
 }
 if(path[0]==="rooms"){
  if(method==="POST"&&!path[1]){const me=await owner(),b=await body(r),tracks=validTracks(b.tracks);if(!tracks.length||tracks.some(t=>t.provider!=="youtube"))throw new HttpError("Together rooms currently play YouTube songs and playlists.");const count=await db().prepare("SELECT COUNT(*) AS n FROM rooms WHERE owner = ?").bind(me).first<{n:number}>();if((count?.n||0)>=10)throw new HttpError("End an existing room before creating another.");const id=newId(),data={tracks,active:0,playing:false,position:0};await db().prepare("INSERT INTO rooms(id,owner,data,revision,updated) VALUES(?,?,?,0,?)").bind(id,me,JSON.stringify(data),Date.now()).run();return json({id,...data,isHost:true,revision:0,updated:Date.now(),listeners:0},201);}
  const room=await roomData(path[1]),user=await getChatGPTUser();
  if(method==="GET"){
   const active=await db().prepare("SELECT COUNT(*) AS n FROM presence WHERE room = ? AND seen > ?").bind(room.id,Date.now()-45000).first<{n:number}>();
   const suggested=await db().prepare("SELECT id,data FROM suggestions WHERE room = ? ORDER BY created LIMIT 25").bind(room.id).all<any>();
   return json({id:room.id,...JSON.parse(room.data),revision:room.revision,updated:room.updated,serverNow:Date.now(),isHost:room.owner===user?.userId,listeners:active?.n||0,suggestions:suggested.results.map(s=>({id:s.id,track:JSON.parse(s.data)}))});
  }
  if(method==="POST"&&path[2]==="presence"){const b=await body(r),id=`${room.id}:${validId(b.id)}`;await db().batch([db().prepare("DELETE FROM presence WHERE room = ? AND seen < ?").bind(room.id,Date.now()-45000),db().prepare("INSERT INTO presence(id,room,seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET seen=excluded.seen").bind(id,room.id,Date.now())]);return json({ok:true});}
  if(method==="POST"&&path[2]==="suggest"){const b=await body(r),track=validTracks([b.track])[0];if(track.provider!=="youtube")throw new HttpError("Suggest a YouTube song for this room.");const count=await db().prepare("SELECT COUNT(*) AS n FROM suggestions WHERE room = ?").bind(room.id).first<{n:number}>();if((count?.n||0)>=25)throw new HttpError("The suggestion queue is full.");await db().prepare("INSERT INTO suggestions(id,room,data,created) VALUES(?,?,?,?)").bind(newId(),room.id,JSON.stringify(track),Date.now()).run();return json({ok:true});}
  if(!user||room.owner!==user.userId)throw new HttpError("Only the host can change room playback.",403);
  if(method==="PUT"){
   const b=await body(r),tracks=validTracks(b.tracks);if(!tracks.length||tracks.some(t=>t.provider!=="youtube"))throw new HttpError("Rooms require YouTube music.");if(!Number.isInteger(b.active)||b.active<0||b.active>=tracks.length||!Number.isFinite(b.position)||b.position<0||b.position>86400||typeof b.playing!=="boolean")throw new HttpError("Invalid playback state.");
   const data={tracks,active:b.active,position:b.position,playing:b.playing};const result=await db().prepare("UPDATE rooms SET data = ?,revision = revision + 1,updated = ? WHERE id = ? AND revision = ?").bind(JSON.stringify(data),Date.now(),room.id,b.revision).run();if(!result.meta.changes)throw new HttpError("The room changed. Please try your action again.",409);if(b.acceptSuggestion)await db().prepare("DELETE FROM suggestions WHERE id = ? AND room = ?").bind(validId(b.acceptSuggestion),room.id).run();return json({revision:room.revision+1,updated:Date.now()});
  }
  if(method==="DELETE"){await db().batch([db().prepare("DELETE FROM rooms WHERE id = ? AND owner = ?").bind(room.id,user.userId),db().prepare("DELETE FROM presence WHERE room = ?").bind(room.id),db().prepare("DELETE FROM suggestions WHERE room = ?").bind(room.id)]);return json({deleted:true});}
 }
 throw new HttpError("Not found.",404);
}
async function handle(r:Request){try{return await route(r);}catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);if(e instanceof Error&&/paste|link|entry|playlist can/i.test(e.message))return json({error:e.message},400);console.error("Novatune request failed",e instanceof Error?e.message:"unknown error");return json({error:"Something went wrong. Please try again; your changes have not been cleared."},500);}}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};
