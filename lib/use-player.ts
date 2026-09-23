"use client";
import { useEffect,useRef,useState } from "react";
import type { Track } from "./music";

declare global {interface Window {YT:any;Spotify:any;onYouTubeIframeAPIReady?:()=>void;onSpotifyWebPlaybackSDKReady?:()=>void}}
let youtubePromise:Promise<void>|undefined,spotifyPromise:Promise<void>|undefined;
function sdk(which:"youtube"|"spotify"){
 if(which==="youtube"&&window.YT?.Player||which==="spotify"&&window.Spotify?.Player)return Promise.resolve();
 const old=which==="youtube"?youtubePromise:spotifyPromise;if(old)return old;
 const p=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${which==="youtube"?"YouTube":"Spotify"} did not load. Check your connection and reload.`)),18000);const done=()=>{clearTimeout(timer);resolve();};if(which==="youtube")window.onYouTubeIframeAPIReady=done;else window.onSpotifyWebPlaybackSDKReady=done;const tag=document.createElement("script");tag.src=which==="youtube"?"https://www.youtube.com/iframe_api":"https://sdk.scdn.co/spotify-player.js";tag.onerror=()=>{clearTimeout(timer);reject(new Error("Music service could not load. Please reload."));};document.head.appendChild(tag);});
 if(which==="youtube")youtubePromise=p;else spotifyPromise=p;return p;
}
export type Selection={track:Track;play:boolean;nonce:number};
export function usePlayer(selection:Selection,onEnded:()=>void,onState?:(playing:boolean,position:number)=>void){
 const mount=useRef<HTMLDivElement>(null),yt=useRef<any>(null),sp=useRef<any>(null),device=useRef(""),ready=useRef(false),current=useRef(selection),ended=useRef(onEnded),stateCb=useRef(onState),spotifyStarted=useRef(false);
 current.current=selection;ended.current=onEnded;stateCb.current=onState;
 const [playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[error,setError]=useState(""),[status,setStatus]=useState("Loading player"),[nowTrack,setNowTrack]=useState<Track|null>(null),[disallows,setDisallows]=useState<Record<string,boolean>>({});
 const report=(e:unknown)=>{setError(e instanceof Error?e.message:"Playback could not start.");setPlaying(false);};
 async function load(s:Selection){
  setError("");setPosition(0);setDuration(0);setPlaying(false);setNowTrack(null);
  if(s.track.provider==="youtube"&&yt.current&&ready.current){const method=s.track.kind==="playlist"?(s.play?"loadPlaylist":"cuePlaylist"):(s.play?"loadVideoById":"cueVideoById");yt.current[method](s.track.kind==="playlist"?{list:s.track.id,listType:"playlist"}:s.track.id);setStatus(s.play?"Loading your song":"Ready when you are");}
 }
 useEffect(()=>{
  let disposed=false;ready.current=false;setError("");setPlaying(false);setPosition(0);setDuration(0);setDisallows({});
  if(selection.track.provider==="youtube"){
   setStatus("Loading player");sdk("youtube").then(()=>{if(disposed||!mount.current)return;const el=document.createElement("div");mount.current.replaceChildren(el);yt.current=new window.YT.Player(el,{width:"100%",height:"100%",videoId:current.current.track.kind==="track"?current.current.track.id:undefined,playerVars:{playsinline:1,origin:location.origin,rel:0},events:{onReady:()=>{if(disposed)return;ready.current=true;void load(current.current);},onStateChange:(e:any)=>{if(disposed)return;const active=e.data===1;setPlaying(active);setStatus(e.data===3?"Buffering…":active?"Playing now":e.data===0?"Song finished":"Ready when you are");if(e.data===1||e.data===2)stateCb.current?.(active,yt.current?.getCurrentTime()||0);if(e.data===0&&current.current.track.kind!=="playlist")ended.current();},onError:(e:any)=>{if(disposed)return;report(new Error(({2:"This video link is invalid.",5:"This browser could not play the video.",100:"This video is private or no longer available.",101:"This song cannot be embedded. Try another upload or open YouTube.",150:"This song cannot be embedded. Try another upload or open YouTube.",153:"YouTube could not verify this page. Open Novatune in a normal browser."} as Record<number,string>)[e.data]||"YouTube could not play this song."));},onAutoplayBlocked:()=>{setPlaying(false);setStatus("Tap play to start");}}});}).catch(report);
  }else{setStatus("Use the Spotify player below");}

  return()=>{disposed=true;ready.current=false;yt.current?.destroy();yt.current=null;sp.current?.disconnect();sp.current=null;device.current="";};
 },[selection.track.provider]);
 useEffect(()=>{if(ready.current||device.current)void load(selection).catch(report);},[selection.nonce]);
 useEffect(()=>{const i=setInterval(()=>{if(current.current.track.provider==="youtube"&&ready.current){setPosition(yt.current?.getCurrentTime()||0);setDuration(yt.current?.getDuration()||0);}else if(sp.current)sp.current.getCurrentState().then((s:any)=>{if(s){setPosition(s.position/1000);setDuration(s.duration/1000);setPlaying(!s.paused);}}).catch(()=>{});},700);return()=>clearInterval(i);},[]);
 function activate(){sp.current?.activateElement()?.catch(report);}
 async function toggle(){if(current.current.track.provider!=="youtube")return;setError("");try{if(!ready.current)throw new Error("The player is still loading. Please try again.");yt.current.getPlayerState()===1?yt.current.pauseVideo():yt.current.playVideo();}catch(e){report(e);}}
 function seek(s:number){if(current.current.track.provider==="youtube")yt.current?.seekTo(s,true);else sp.current?.seek(s*1000).catch(report);setPosition(s);}
 function volume(v:number){if(current.current.track.provider==="youtube")yt.current?.setVolume(v);else sp.current?.setVolume(v/100).catch(report);}
 function pause(){yt.current?.pauseVideo();sp.current?.pause().catch(()=>{});}
 function playlistNext(direction:number){if(current.current.track.provider==="youtube"){direction>0?yt.current?.nextVideo():yt.current?.previousVideo();}else (direction>0?sp.current?.nextTrack():sp.current?.previousTrack())?.catch(report);}
 function sync(p:number,shouldPlay:boolean){if(!ready.current)return;const position=yt.current.getCurrentTime()||0;if(Math.abs(position-p)>2.5)yt.current.seekTo(p,true);shouldPlay?yt.current.playVideo():yt.current.pauseVideo();}
 return {mount,playing,position,duration,error,status,nowTrack,disallows,toggle,seek,volume,pause,activate,playlistNext,sync,setError};
}
