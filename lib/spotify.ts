import type { Track } from "./music";
const TOKEN_KEY="unitune.spotify.session", FLOW_KEY="unitune.spotify.pkce";
type Session={access_token:string;refresh_token:string;expires:number;clientId:string};
function session():Session|null{try{return JSON.parse(sessionStorage.getItem(TOKEN_KEY)||"null");}catch{return null;}}
export function spotifyConnected(){return !!session();}
export function disconnectSpotify(){sessionStorage.removeItem(TOKEN_KEY);}
const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
export async function connectSpotify(clientId:string){
 if(!clientId)throw new Error("Spotify setup is required. Open Music services for the setup steps.");
 const verifier=b64(crypto.getRandomValues(new Uint8Array(64))),state=b64(crypto.getRandomValues(new Uint8Array(24)));
 const redirect=`${location.origin}/auth/spotify`,challenge=b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))));
 sessionStorage.setItem(FLOW_KEY,JSON.stringify({verifier,state,redirect,clientId,created:Date.now(),returnTo:location.pathname+location.search}));
 const p=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirect,state,code_challenge:challenge,code_challenge_method:"S256",scope:"streaming user-read-private user-read-email playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state"});
 location.assign(`https://accounts.spotify.com/authorize?${p}`);
}
export async function completeSpotifyAuth(){
 if(location.pathname!=="/auth/spotify")return false;
 const query=new URLSearchParams(location.search),raw=sessionStorage.getItem(FLOW_KEY);sessionStorage.removeItem(FLOW_KEY);
 history.replaceState({},"","/auth/spotify");
 if(query.get("error"))throw new Error("Spotify connection was cancelled. You can try again in Music services.");
 let flow:any;try{flow=JSON.parse(raw||"null");}catch{}
 if(!flow||flow.state!==query.get("state")||Date.now()-flow.created>600000||!query.get("code"))throw new Error("Spotify sign-in expired or could not be verified. Please connect again.");
 const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code:query.get("code")!,client_id:flow.clientId,redirect_uri:flow.redirect,code_verifier:flow.verifier})});
 if(!r.ok)throw new Error("Spotify could not complete sign-in. Check the app's registered callback URL and try again.");
 const t=await r.json() as any;sessionStorage.setItem(TOKEN_KEY,JSON.stringify({...t,clientId:flow.clientId,expires:Date.now()+t.expires_in*1000}));
 const returnTo=typeof flow.returnTo==="string"&&flow.returnTo.startsWith("/")&&!flow.returnTo.startsWith("//")?flow.returnTo:"/";location.replace(returnTo);return true;
}
let refreshFlight:Promise<string>|null=null;
export async function spotifyToken():Promise<string>{
 const s=session();if(!s)throw new Error("Connect Spotify to play this song. Spotify Premium is required.");
 if(s.expires>Date.now()+60000)return s.access_token;
 if(refreshFlight)return refreshFlight;
 refreshFlight=(async()=>{const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:s.refresh_token,client_id:s.clientId})});if(!r.ok){disconnectSpotify();throw new Error("Your Spotify session expired. Please connect again.");}const t=await r.json() as any;sessionStorage.setItem(TOKEN_KEY,JSON.stringify({...s,...t,refresh_token:t.refresh_token||s.refresh_token,expires:Date.now()+t.expires_in*1000}));return t.access_token;})();
 try{return await refreshFlight;}finally{refreshFlight=null;}
}
export async function spotifyApi(path:string,options:RequestInit={}):Promise<any>{
 if(!path.startsWith("/")||path.startsWith("//"))throw new Error("Invalid Spotify request.");
 const r=await fetch(`https://api.spotify.com/v1${path}`,{...options,headers:{"Content-Type":"application/json",Authorization:`Bearer ${await spotifyToken()}`,...options.headers}});
 if(!r.ok){const error=await r.json().catch(()=>({})) as any;throw new Error(r.status===429?"Spotify is busy. Please wait a moment and retry.":r.status===403?"Spotify cannot allow this action. Check Premium, your app's user allowlist, and playlist access.":error.error?.message||"Spotify could not complete that action.");}
 return r.status===204?null:await r.json();
}
export function spotifyTrack(t:any):Track{return {provider:"spotify",kind:"track",id:t.id,title:t.name,artist:(t.artists||[]).map((a:any)=>a.name).join(", "),image:t.album?.images?.[0]?.url,url:`https://open.spotify.com/track/${t.id}`};}
export async function spotifyMetadata(track:Track){const t=await spotifyApi(`/${track.kind==="track"?"tracks":"playlists"}/${track.id}`);return track.kind==="track"?spotifyTrack(t):{...track,title:t.name,artist:t.owner?.display_name||"Spotify playlist",image:t.images?.[0]?.url};}
