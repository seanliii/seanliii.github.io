import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANETS } from './planet-data.js';

const $ = s => document.querySelector(s);
const TAU = Math.PI * 2;
const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'});
} catch (error) {
  $('#fallback').style.display='grid'; $('#status').hidden=true; throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.3 : 1.7));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(0x01030a,.00225);
const camera=new THREE.PerspectiveCamera(47,innerWidth/innerHeight,.1,1200); camera.position.set(68,45,73);
const controls=new OrbitControls(camera,canvas); controls.enableDamping=true; controls.dampingFactor=.055; controls.minDistance=8; controls.maxDistance=230; controls.maxPolarAngle=Math.PI*.95; controls.target.set(0,0,0);
scene.add(new THREE.HemisphereLight(0x263f70,0x020207,.23));

function glowTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),g=x.createRadialGradient(128,128,8,128,128,128);g.addColorStop(0,'rgba(255,255,235,1)');g.addColorStop(.17,'rgba(255,194,70,.9)');g.addColorStop(.42,'rgba(255,104,22,.3)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,256,256);return new THREE.CanvasTexture(c)}
const sun=new THREE.Mesh(new THREE.SphereGeometry(4.15,56,40),new THREE.MeshBasicMaterial({color:0xffc45b}));scene.add(sun);
const corona=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));corona.scale.set(26,26,1);scene.add(corona);
scene.add(new THREE.PointLight(0xffd3a0,1020,245,1.65));
function stars(n,r,size,opacity){const a=new Float32Array(n*3);for(let i=0;i<n;i++){const z=Math.random()*2-1,t=Math.random()*TAU,q=Math.sqrt(1-z*z)*r;a[i*3]=q*Math.cos(t);a[i*3+1]=z*r;a[i*3+2]=q*Math.sin(t)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(a,3));const points=new THREE.Points(g,new THREE.PointsMaterial({color:0xd2e3ff,size,sizeAttenuation:true,transparent:true,opacity,depthWrite:false}));scene.add(points);return points}
stars(innerWidth<760?850:1800,360,.42,.82);stars(innerWidth<760?130:340,320,1.05,.72);
function textureFor(p,i){const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d'),hex='#'+new THREE.Color(p.color).getHexString();x.fillStyle=hex;x.fillRect(0,0,512,256);for(let y=0;y<256;y+=8){const warm=i===4||i===5;x.fillStyle=warm?`rgba(90,45,20,${.035+Math.random()*.12})`:`rgba(230,245,255,${.02+Math.random()*.08})`;x.fillRect(0,y+Math.random()*7,512,2+Math.random()*8)}if(p.id==='earth'){x.fillStyle='rgba(68,132,72,.72)';for(let k=0;k<18;k++){x.beginPath();x.ellipse(Math.random()*512,Math.random()*220,12+Math.random()*30,4+Math.random()*14,Math.random(),0,TAU);x.fill()}}if(p.id==='jupiter'){x.fillStyle='rgba(135,45,31,.65)';x.beginPath();x.ellipse(360,150,28,11,-.1,0,TAU);x.fill()}for(let k=0;k<35;k++){x.fillStyle=`rgba(255,255,255,${Math.random()*.065})`;x.beginPath();x.arc(Math.random()*512,Math.random()*256,Math.random()*16,0,TAU);x.fill()}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
const bodies=[],clickables=[];
PLANETS.forEach((p,i)=>{const orbitRadius=11+i*7.25,radius=Math.min(3.2,.55+.8*Math.pow(p.radiusKm/6371,.42));const orbit=new THREE.Mesh(new THREE.RingGeometry(orbitRadius-.035,orbitRadius+.035,180),new THREE.MeshBasicMaterial({color:0x6d91c9,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}));orbit.rotation.x=Math.PI/2;scene.add(orbit);const pivot=new THREE.Group();pivot.rotation.y=i*.82+.42;scene.add(pivot);const node=new THREE.Group();node.position.x=orbitRadius;pivot.add(node);const axial=new THREE.Group();axial.rotation.z=THREE.MathUtils.degToRad(p.tilt);node.add(axial);const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,48,32),new THREE.MeshStandardMaterial({map:textureFor(p,i),roughness:.76,metalness:0}));axial.add(mesh);const hit=new THREE.Mesh(new THREE.SphereGeometry(Math.max(radius,1.2),18,14),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));node.add(hit);if(p.id==='saturn'){const ring=new THREE.Mesh(new THREE.RingGeometry(radius*1.25,radius*2.12,96),new THREE.MeshBasicMaterial({color:0xd7c49e,transparent:true,opacity:.68,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=Math.PI/2;axial.add(ring)}const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:p.color,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));marker.scale.set(radius*3.6,radius*3.6,1);node.add(marker);hit.userData={p};bodies.push({p,pivot,node,mesh,orbit,marker,base:i*.82+.42});clickables.push(hit)});
const nav=$('#planet-nav');PLANETS.forEach(p=>{const b=document.createElement('button');b.type='button';b.textContent=p.zh.slice(0,1);b.title=`选择${p.zh}`;b.setAttribute('aria-label',`选择${p.zh}`);b.dataset.id=p.id;b.onclick=()=>selectPlanet(p.id);nav.appendChild(b)});
let selected=null;
function selectPlanet(id){selected=bodies.find(b=>b.p.id===id)||null;bodies.forEach(b=>{const active=b===selected;b.orbit.material.opacity=active?.58:.13;b.marker.material.opacity=active?.3:0});nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));if(!selected)return;const p=selected.p;$('#name').textContent=`${p.zh} · ${p.en}`;$('#summary').textContent=p.summary;$('#stats').innerHTML=`<div><b>${p.distanceAU} AU</b><span>平均距日</span></div><div><b>${p.orbitDays.toLocaleString()} 日</b><span>公转周期</span></div><div><b>${Math.abs(p.rotationHours).toLocaleString()} 小时</b><span>${p.rotationHours<0?'逆向':'顺向'}恒星日</span></div><div><b>${p.radiusKm.toLocaleString()} km</b><span>平均半径</span></div><div><b>${p.tilt}°</b><span>轴倾角</span></div><div><b>${p.rotationHours<0?'逆行':'顺行'}</b><span>自转方向</span></div>`;$('#card').classList.add('open');$('#close').focus({preventScroll:true})}
function clearSelection(){selected=null;bodies.forEach(b=>{b.orbit.material.opacity=.13;b.marker.material.opacity=0});nav.querySelectorAll('button').forEach(b=>b.classList.remove('active'));$('#card').classList.remove('open')}
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),down={x:0,y:0};canvas.addEventListener('pointerdown',e=>{down.x=e.clientX;down.y=e.clientY});canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7)return;const rect=canvas.getBoundingClientRect();pointer.x=(e.clientX-rect.left)/rect.width*2-1;pointer.y=-(e.clientY-rect.top)/rect.height*2+1;ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(clickables)[0];hit?selectPlanet(hit.object.userData.p.id):clearSelection()});
$('#close').onclick=clearSelection;addEventListener('keydown',e=>{if(e.key==='Escape')clearSelection()});
let speed=12,simDays=0,last=performance.now(),paused=false,tween=null;
$('#pause').onclick=e=>{paused=!paused;e.currentTarget.textContent=paused?'继续':'暂停';e.currentTarget.setAttribute('aria-pressed',String(paused))};$('#speed').onchange=e=>speed=+e.target.value;
function moveCamera(position,target,duration=850){tween={start:performance.now(),duration,fromP:camera.position.clone(),toP:position.clone(),fromT:controls.target.clone(),toT:target.clone()}}
$('#reset').onclick=()=>moveCamera(new THREE.Vector3(68,45,73),new THREE.Vector3(0,0,0));
$('#focus').onclick=()=>{if(!selected)return;const world=new THREE.Vector3();selected.node.getWorldPosition(world);const dir=camera.position.clone().sub(controls.target).normalize();const distance=Math.max(7,selected.mesh.geometry.parameters.radius*5);moveCamera(world.clone().add(dir.multiplyScalar(distance)),world,750)};
function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)simDays+=dt*speed;bodies.forEach(b=>{b.pivot.rotation.y=b.base+TAU*simDays/b.p.orbitDays;b.mesh.rotation.y=TAU*(simDays*24)/b.p.rotationHours});sun.rotation.y+=dt*.04;corona.material.opacity=.78+Math.sin(now*.00135)*.07;if(tween){const u=Math.min(1,(now-tween.start)/tween.duration),k=1-Math.pow(1-u,3);camera.position.lerpVectors(tween.fromP,tween.toP,k);controls.target.lerpVectors(tween.fromT,tween.toT,k);if(u===1)tween=null}controls.update();renderer.render(scene,camera);requestAnimationFrame(frame)}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}addEventListener('resize',resize);resize();requestAnimationFrame(frame);
$('#status').textContent='星图已就绪 · 拖拽探索';$('#status').style.cssText='top:auto;bottom:3px;opacity:.01';
window.__SOLAR_READY__=true;window.__PLANET_COUNT__=bodies.length;window.__PLANETS__=PLANETS.map(p=>({...p}));window.__SOLAR_TEST__={selectPlanet,get selectedId(){return selected?.p.id||null},get cardName(){return $('#name').textContent},get paused(){return paused},get simDays(){return simDays},get speed(){return speed}};
