export type Track = { provider:"youtube"|"spotify"; id:string; kind:"track"|"playlist"; title:string; artist:string; image?:string; url:string };
export const eveningTracks: Track[] = [
 {provider:"youtube",id:"vt4jX0iRgCg",kind:"track",title:"Kho Gaye Hum Kahan",artist:"Jasleen Royal, Prateek Kuhad",url:"https://www.youtube.com/watch?v=vt4jX0iRgCg"},
 {provider:"youtube",id:"DK_UsATwoxI",kind:"track",title:"Nazm Nazm",artist:"Arko · Bareilly Ki Barfi",url:"https://www.youtube.com/watch?v=DK_UsATwoxI"},
 {provider:"youtube",id:"EatzcaVJRMs",kind:"track",title:"Tera Yaar Hoon Main",artist:"Arijit Singh · Sonu Ke Titu Ki Sweety",url:"https://www.youtube.com/watch?v=EatzcaVJRMs"},
];
export function parseMusicLink(input:string):Track {
 let u:URL;try{u=new URL(input.trim());}catch{throw new Error("Paste a complete YouTube or Spotify song or playlist link.");}
 if(u.protocol!=="https:"||u.username||u.password||u.port)throw new Error("Use a secure, original music link.");
 const host=u.hostname.toLowerCase();
 if(["youtube.com","www.youtube.com","music.youtube.com","m.youtube.com","youtu.be","www.youtu.be"].includes(host)){
  const list=u.searchParams.get("list");const parts=u.pathname.split("/").filter(Boolean);
  const id=host.endsWith("youtu.be")?parts[0]:u.searchParams.get("v")||(["shorts","embed","live"].includes(parts[0])?parts[1]:null);
  if(id&&/^[\w-]{11}$/.test(id))return {...eveningTracks.find(t=>t.id===id),provider:"youtube",id,kind:"track",title:eveningTracks.find(t=>t.id===id)?.title||"YouTube song",artist:eveningTracks.find(t=>t.id===id)?.artist||"YouTube",url:`https://www.youtube.com/watch?v=${id}`};
  if(list&&/^[\w-]{10,100}$/.test(list))return {provider:"youtube",id:list,kind:"playlist",title:"YouTube playlist",artist:"Your selected playlist",url:`https://www.youtube.com/playlist?list=${list}`};
  throw new Error("This YouTube link does not contain a valid song or playlist.");
 }
 if(host==="open.spotify.com"){
  const match=u.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(track|playlist)\/([A-Za-z0-9]{22})\/?$/);
  if(match)return {provider:"spotify",kind:match[1] as Track["kind"],id:match[2],title:match[1]==="track"?"Spotify song":"Spotify playlist",artist:"Spotify",url:`https://open.spotify.com/${match[1]}/${match[2]}`};
 }
 if(host==="spotify.link"||host==="spoti.fi")throw new Error("Open the short link first, then paste its open.spotify.com address.");
 throw new Error("This version supports YouTube, YouTube Music and Spotify song/playlist links.");
}
export function validTracks(value:unknown):Track[]{
 if(!Array.isArray(value)||value.length>500)throw new Error("A playlist can have up to 500 entries.");
 return value.map(v=>{if(!v||typeof v.url!=="string")throw new Error("Invalid music entry.");const parsed=parseMusicLink(v.url);return {...parsed,title:typeof v.title==="string"?v.title.slice(0,200):parsed.title,artist:typeof v.artist==="string"?v.artist.slice(0,200):parsed.artist};});
}
export function formatTime(s:number){const n=Math.max(0,Math.floor(s||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`;}
