"use strict";
const CSV_URL = "https://raw.githubusercontent.com/Rebentisu/plant-species-database/main/database_site_rurbanive_with_images.csv";
const $ = (id) => document.getElementById(id);
const grid = $("plantGrid"), plantDialog = $("plantDialog"), lightbox = $("photoLightbox");
let allPlants=[], lastRendered=[], edibleOnly=false, beeOnly=false, activeImages=[], imageIndex=0, previousFocus=null;
const clean = (v) => String(v ?? "").trim();
const yes = (v) => /^yes$/i.test(clean(v));
const escapeHTML = (value) => clean(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const urls = (val) => clean(val).split("|").map(s=>s.trim()).filter(x=>/^https:\/\//i.test(x));
const textField=(p,key)=>clean(p[key]);
const nothing = v => !clean(v) || /^(unknown|n\/a|na)$/i.test(clean(v));
function parseCSV(str){
 const lines=[];let row=[],field="",q=false;
 for(let i=0;i<str.length;i++){
   const c=str[i],next=str[i+1];
   if(c==='"'){if(q&&next==='"'){field+='"';i++;}else q=!q}
   else if(c===","&&!q){row.push(field);field=""}
   else if((c==="\r"||c==="\n")&&!q){if(c==="\r"&&next==="\n")i++;row.push(field);field="";if(row.some(s=>s.trim()))lines.push(row);row=[]}
   else field+=c;
 }
 if(field.length||row.length){row.push(field);if(row.some(s=>s.trim()))lines.push(row)}
 const headers=(lines.shift()||[]).map(x=>x.replace(/^\uFEFF/,"").trim());
 return lines.map(row=>Object.fromEntries(headers.map((h,i)=>[h,clean(row[i])])));
}
function displayValue(key,val){
 let value=clean(val);
 if(key==="Red list Assessment")value=value.replace(/\bNE\b/gi,"Not Evaluated").replace(/\bLC\b/gi,"Least Concern");
 if(key==="scientific_name" && /Erica malipuliflora/i.test(value))value="Erica manipuliflora";
 return value;
}
function renderValue(key,val){return escapeHTML(displayValue(key,val))}
function formatTrait(label,value,wide=false){
 if(nothing(value))return "";
 const content=renderValue(label,value);
 return '<div class="trait'+(wide?' span-two':'')+'"><span class="trait-label">'+escapeHTML(label)+'</span><div class="trait-value">'+content+'</div></div>';
}
function makeTraits(p){
 const out=[];
 // These are shown as descriptive mechanisms, not redundant Yes badges.
 const mechanismGroups=[
  ["Fire resistance","Fire resistance mechanism"],
  ["Allelopathy","Allelopathy mechanism"],
  ["Herbivory resistance","Anti-herbivory traits"]
 ];
 const skip=new Set(["id","card_image","scientific_name","gallery_images","gallery_captions","AMF_image","Rhizobia_image","AMF_image_caption","Rhizobia_image_caption","Family","Greek Name","Common Name","Symbionts","AMF","Rhizobia","Ericoid mycorrhizal fungi","Pollinators"]);
 for(const [trait,mechanism] of mechanismGroups){
   skip.add(mechanism);
   const a=textField(p,trait),m=textField(p,mechanism);
   if(!nothing(a)||!nothing(m)){
     let value=(!nothing(a)&&!(yes(a)&&m))?a:"";
     if(m)value+=(value?" — ":"")+m;
     if(value)out.push(formatTrait(trait,value,true));
   }
   skip.add(trait);
 }
 const order=[
  "Plant type","Primary Habitat","Flowering period","Red list Assessment","Population Trend","Reclamation plants",
  "Bee plant","Wind pollinarion","Pollen / Nectar / Honeydew Production","Edible","Edible parts",
  "Salinity Tolerance","Xerohalophyte","Chasmophyte","Obligate halophyte","Facultative halophyte",
  "Phanerophyte","Cryptophyte","Hemicryptophyte","Chamaephyte","Photosynthetic pathway",
  "Nitrogen fixer","Endemism"
 ];
 const labels={"Wind pollinarion":"Wind pollination","Reclamation plants":"Reclamation plants","Chasmophyte":"Chasmophyte"};
 for(const key of order){
   const value=textField(p,key);
   if(skip.has(key)||nothing(value))continue;
   out.push(formatTrait(labels[key]||key,value,["Primary Habitat","Pollen / Nectar / Honeydew Production"].includes(key)));
   skip.add(key);
 }
 for(const key of Object.keys(p)){if(!skip.has(key)&&!nothing(p[key]))out.push(formatTrait(key,p[key],true))}
 return out.length ? '<h3 class="traits-title">Ecological profile</h3><div class="traits-grid">'+out.join("")+'</div>' : "";
}
function sectionImageButton(imgs,index,klass,alt){
 return '<button type="button" class="'+klass+'" data-photo-set="'+escapeHTML(JSON.stringify(imgs))+'" data-photo-index="'+index+'" aria-label="'+escapeHTML(alt)+'"><img loading="lazy" src="'+escapeHTML(imgs[index])+'" alt="'+escapeHTML(alt)+'"></button>';
}
function makeSymbiont(p,key,title){
 const imgs=urls(p[key+"_image"]);if(!imgs.length)return "";
 const caption=textField(p,key+"_image_caption") || (key==="AMF"
  ? "Arbuscules in roots stained with trypan blue, indicating arbuscular mycorrhizal colonization."
  : "Nodules of "+displayValue("scientific_name",p.scientific_name)+", indicating rhizobial symbiosis and nitrogen fixation.");
 const label=title;
 const buttons=sectionImageButton(imgs,0,"symbiont-photo","Enlarge "+label+" image")+
 (imgs.length>1?'<div class="symbiont-thumbs">'+imgs.slice(1).map((u,i)=>sectionImageButton(imgs,i+1,"symbiont-photo","Enlarge "+label+" image "+(i+2))).join("")+'</div>':"");
 return '<section class="symbiont-box"><h4>'+escapeHTML(label)+'</h4>'+buttons+'<p class="symbiont-caption">'+escapeHTML(caption)+'</p></section>';
}
function makePlantDialog(p){
 const sci=displayValue("scientific_name",p.scientific_name),family=textField(p,"Family"),greek=textField(p,"Greek Name"),common=textField(p,"Common Name");
 const primary=urls(p.card_image),gallery=urls(p.gallery_images);
 const photoSet=[...primary,...gallery];
 const pollinators=gallery.filter(()=>false); // pollinator photographs are stored in gallery_images
 const hero=primary.length?sectionImageButton(photoSet,0,"main-photo","Enlarge photograph of "+sci):"";
 const thumbnails=gallery.length?'<section class="photo-collection"><h3>Plant gallery</h3><div class="gallery-row">'+gallery.map((_,i)=>sectionImageButton(photoSet,i+primary.length,"gallery-thumb","Enlarge gallery photograph "+(i+1)+" of "+sci)).join("")+'</div></section>':"";
 const micro=[makeSymbiont(p,"AMF","AMF"),makeSymbiont(p,"Rhizobia","Nitrogen-Fixing Nodules")].filter(Boolean);
 const microHTML=micro.length?'<h3 class="symbionts-title">Symbiotic associations</h3><div class="symbiont-grid">'+micro.join("")+'</div>':"";
 const symbiontText=[["Symbionts","Symbionts"],["AMF","AMF"],["Rhizobia","Rhizobia"],["Ericoid mycorrhizal fungi","Ericoid mycorrhizal fungi"]].map(([label,key])=>formatTrait(label,p[key])).filter(Boolean).join("");
 const pollinatorTrait=formatTrait("Pollinators",p.Pollinators,true);
 return '<div class="dialog-content"><div class="plant-heading"><h2>'+escapeHTML(sci)+'</h2><p>'+[common,greek,family].filter(Boolean).map(escapeHTML).join(" · ")+'</p></div>'+
 hero+thumbnails+makeTraits(p)+(symbiontText||pollinatorTrait?'<h3 class="traits-title">Biological interactions</h3><div class="traits-grid">'+symbiontText+pollinatorTrait+'</div>':"")+microHTML+'</div>';
}
function openPlant(p){
 previousFocus=document.activeElement;
 $("plantDialogContent").innerHTML=makePlantDialog(p);
 plantDialog.showModal();
 const url=new URL(location.href);url.searchParams.set("id",p.id);history.replaceState(null,"",url);
}
function closePlant(){plantDialog.close()}
$("closePlantDialog").addEventListener("click",closePlant);
plantDialog.addEventListener("close",()=>{
 previousFocus?.focus?.();
 const url=new URL(location.href);url.searchParams.delete("id");history.replaceState(null,"",url);
});
plantDialog.addEventListener("click",e=>{if(e.target===plantDialog)closePlant()});
function showLightbox(){
 const src=activeImages[imageIndex];if(!src)return;
 $("lightboxImage").src=src;$("lightboxImage").alt="Enlarged botanical photograph";
 $("lightboxCaption").textContent=activeImages.length>1?(imageIndex+1)+" / "+activeImages.length:"";
 $("lightboxPrev").hidden=activeImages.length<2;$("lightboxNext").hidden=activeImages.length<2;
}
function openLightbox(images,index){
 activeImages=images;imageIndex=Math.max(0,Math.min(images.length-1,index));showLightbox();
 lightbox.showModal();
}
function shiftLightbox(dir){imageIndex=(imageIndex+dir+activeImages.length)%activeImages.length;showLightbox()}
$("closePhotoLightbox").addEventListener("click",()=>lightbox.close());
$("lightboxPrev").addEventListener("click",()=>shiftLightbox(-1));
$("lightboxNext").addEventListener("click",()=>shiftLightbox(1));
lightbox.addEventListener("click",e=>{if(e.target===lightbox)lightbox.close()});
window.addEventListener("keydown",e=>{
 if(!lightbox.open)return;
 if(e.key==="ArrowRight")shiftLightbox(1);
 if(e.key==="ArrowLeft")shiftLightbox(-1);
});
$("plantDialogContent").addEventListener("click",e=>{
 const target=e.target.closest("button[data-photo-set]");if(!target)return;
 try{const imgs=JSON.parse(target.dataset.photoSet);openLightbox(imgs,Number(target.dataset.photoIndex))}catch(e){console.error(e)}
});
let touchStart=0;
lightbox.addEventListener("touchstart",e=>{touchStart=e.changedTouches[0]?.screenX||0},{passive:true});
lightbox.addEventListener("touchend",e=>{const diff=(e.changedTouches[0]?.screenX||0)-touchStart;if(Math.abs(diff)>55 && activeImages.length>1)shiftLightbox(diff>0?-1:1)},{passive:true});
function render(plants){
 lastRendered=plants.filter(p=>p.card_image&&p.scientific_name);
 grid.innerHTML=lastRendered.map(p=>'<article class="card-animation-layer"><div class="card" data-id="'+escapeHTML(p.id)+'"><button class="card-button" type="button" data-plant-id="'+escapeHTML(p.id)+'" aria-label="View '+escapeHTML(displayValue("scientific_name",p.scientific_name))+'"><div class="image-wrap loading"><img loading="lazy" decoding="async" src="'+escapeHTML(p.card_image)+'" alt="'+escapeHTML(displayValue("scientific_name",p.scientific_name))+'"></div><span class="card-title">'+escapeHTML(displayValue("scientific_name",p.scientific_name))+'</span><span class="card-family">'+escapeHTML(p.Family)+'</span></button></div></article>').join("")||'<p class="error">No plants match your filters.</p>';
 grid.querySelectorAll(".image-wrap img").forEach(img=>{
  const done=()=>img.parentNode?.classList.remove("loading");if(img.complete)done();
  img.addEventListener("load",done,{once:true});img.addEventListener("error",done,{once:true});
 });
 $("statusLine").textContent=lastRendered.length+" plants shown";
}
grid.addEventListener("click",e=>{
 const button=e.target.closest("[data-plant-id]");if(!button)return;
 const plant=allPlants.find(p=>p.id===button.dataset.plantId);if(plant)openPlant(plant);
});
function applyFilters(){
 const q=clean($("searchInput").value).toLocaleLowerCase();
 render(allPlants.filter(p=>{
 const txt=[p.scientific_name,p["Greek Name"],p.Family,p["Common Name"]].join(" ").toLocaleLowerCase();
 return (!q||txt.includes(q))&&(!edibleOnly||yes(p.Edible))&&(!beeOnly||yes(p["Bee plant"]));
 }));
}
$("searchInput").addEventListener("input",applyFilters);
$("edibleBtn").addEventListener("click",()=>{edibleOnly=!edibleOnly;$("edibleBtn").setAttribute("aria-pressed",String(edibleOnly));applyFilters()});
$("beeBtn").addEventListener("click",()=>{beeOnly=!beeOnly;$("beeBtn").setAttribute("aria-pressed",String(beeOnly));applyFilters()});
$("clearBtn").addEventListener("click",()=>{$("searchInput").value="";edibleOnly=false;beeOnly=false;$("edibleBtn").setAttribute("aria-pressed","false");$("beeBtn").setAttribute("aria-pressed","false");applyFilters();$("statusLine").textContent="Filters cleared"});
$("randomBtn").addEventListener("click",()=>{
 if(!lastRendered.length)return;
 const plant=lastRendered[Math.floor(Math.random()*lastRendered.length)];
 const card=Array.from(grid.querySelectorAll(".card")).find(c=>c.dataset.id===plant.id);
 if(!card)return;
 grid.querySelectorAll(".picked").forEach(c=>c.classList.remove("picked"));
 card.classList.add("picked");card.scrollIntoView({behavior:"smooth",block:"center"});
 $("statusLine").textContent="Random pick: "+displayValue("scientific_name",plant.scientific_name);
});
(async()=>{
 try{
  grid.innerHTML='<p class="loading">Loading plants…</p>';
  const response=await fetch(CSV_URL,{cache:"no-store"});if(!response.ok)throw new Error("CSV HTTP "+response.status);
  allPlants=parseCSV(await response.text());applyFilters();
  const id=new URL(location.href).searchParams.get("id");
  const p=allPlants.find(x=>x.id===id);if(p)openPlant(p);
 }catch(e){console.error(e);grid.innerHTML='<p class="error">Could not load the plant database. Check the browser console.</p>'}
})();
// Original blob menu animation, adapted for keyboard and touch.
(()=>{
 const menu=$("menu"),blob=$("blob"),path=$("blob-path"),hamburger=document.querySelector(".hamburger"),inner=document.querySelector(".menu-inner");
 if(!menu||!blob||!path||!hamburger||!inner)return;
 const VB_W=60,VB_H=1000,anchor=120,curviness=65,hoverZone=150,expand=8,maxPull=22;
 let peek=22,mouseX=0,mouseY=innerHeight/2,y=mouseY,curveX=0,targetX=0,expanded=false;
 function getPeek(){const n=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--peek"));return Number.isFinite(n)?n:22}
 function setMenu(on){menu.classList.toggle("expanded",on);expanded=on;hamburger.setAttribute("aria-expanded",String(on))}
 hamburger.addEventListener("mouseenter",()=>setMenu(true));inner.addEventListener("mouseenter",()=>setMenu(true));menu.addEventListener("mouseleave",()=>setMenu(false));
 hamburger.addEventListener("click",()=>setMenu(!expanded));
 menu.addEventListener("focusin",()=>setMenu(true));
 menu.addEventListener("focusout",e=>{if(!menu.contains(e.relatedTarget))setMenu(false)});
 window.addEventListener("pointermove",e=>{mouseX=e.clientX;mouseY=e.clientY},{passive:true});
 window.addEventListener("resize",()=>{peek=getPeek()});
 peek=getPeek();
 function tick(){
 const vh=Math.max(1,innerHeight);const minPx=anchor/VB_H*vh,maxPx=(VB_H-anchor)/VB_H*vh;
 y+=(Math.min(maxPx,Math.max(minPx,mouseY))-y)*.18;
 hamburger.style.top=(y-(hamburger.offsetHeight||26)/2)+"px";
 const yVB=y/vh*VB_H;
 targetX=expanded||mouseX>hoverZone?0:Math.max(-maxPull,Math.min(0,-((VB_W+expand)/100)*(mouseX-hoverZone)));
 curveX+=(targetX-curveX)*.12;
 const d="M"+VB_W+","+VB_H+"H0V0h"+VB_W+"v"+(yVB-anchor)+"c0,"+curviness+","+curveX+","+curviness+","+curveX+","+anchor+"S"+VB_W+","+yVB+","+VB_W+","+(yVB+anchor*2)+"V"+VB_H+"z";
 path.setAttribute("d",d);blob.style.width=(peek+Math.abs(curveX))+"px";
 requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
})();
