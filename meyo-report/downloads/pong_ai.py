from PIL import Image, ImageDraw, ImageFont
import random, math, json, os
random.seed(31)
W,H=560,340
PAD_W,PAD_H=12,72
LX,RX=28,W-40
left_y=right_y=(H-PAD_H)/2
ball_x,ball_y=W/2,H/2
vx,vy=8.2,3.6
left_score=right_score=0
frames=[]
trail=[]
point_banner=0
last_scorer=''
freeze=0
frame_no=0
font=ImageFont.load_default()
def serve(direction):
    global ball_x,ball_y,vx,vy
    ball_x,ball_y=W/2,H/2
    vx=direction*random.uniform(8.0,9.4)
    vy=random.choice([-1,1])*random.uniform(2.7,5.2)
def render():
    im=Image.new('P',(W,H),0)
    # custom compact palette
    pal=[5,10,22, 20,220,255, 255,82,145, 238,245,255, 90,115,150, 255,205,55, 35,55,80, 255,255,255]
    pal += [0]*(768-len(pal)); im.putpalette(pal)
    d=ImageDraw.Draw(im)
    # arena + scan lines
    d.rectangle((8,8,W-9,H-9),outline=4,width=2)
    for y in range(18,H-10,12): d.line((10,y,W-10,y),fill=6)
    for y in range(14,H-12,20): d.rectangle((W//2-1,y,W//2+1,y+10),fill=4)
    # trail
    for i,(tx,ty) in enumerate(trail[-5:]):
        c=4 if i<3 else 5
        r=2+i//2; d.ellipse((tx-r,ty-r,tx+r,ty+r),fill=c)
    # paddles with glow
    for x,y,c in ((LX,left_y,1),(RX,right_y,2)):
        d.rounded_rectangle((x-3,int(y)-3,x+PAD_W+3,int(y)+PAD_H+3),radius=5,outline=6,width=2)
        d.rounded_rectangle((x,int(y),x+PAD_W,int(y)+PAD_H),radius=4,fill=c)
    d.ellipse((int(ball_x)-7,int(ball_y)-7,int(ball_x)+7,int(ball_y)+7),fill=5)
    d.ellipse((int(ball_x)-4,int(ball_y)-4,int(ball_x)+4,int(ball_y)+4),fill=3)
    # score/status
    d.rectangle((W//2-80,15,W//2+80,55),fill=0,outline=4)
    d.text((W//2-42,23),str(left_score),font=font,fill=1)
    d.text((W//2-3,23),':',font=font,fill=3)
    d.text((W//2+34,23),str(right_score),font=font,fill=2)
    d.text((18,H-22),'FOLLOW AI',font=font,fill=1)
    d.text((W-116,H-22),'CHAOS AI',font=font,fill=2)
    d.text((W//2-35,H-22),'FIRST TO 5',font=font,fill=4)
    if point_banner>0:
        d.rectangle((W//2-90,H//2-25,W//2+90,H//2+25),fill=0,outline=5,width=2)
        txt=('FOLLOW AI SCORES!' if last_scorer=='L' else 'CHAOS AI SCORES!')
        d.text((W//2-len(txt)*3,H//2-5),txt,font=font,fill=5)
    frames.append(im)
# opening hold
for _ in range(20): render()
while max(left_score,right_score)<5 and frame_no<8000:
    frame_no+=1
    # Follow AI: accurate tracking with physically limited speed
    target=ball_y-PAD_H/2
    left_y += max(-7.0,min(7.0,target-left_y))
    # Chaos AI tracks but occasionally freezes/aims badly
    if freeze<=0 and random.random()<0.018:
        freeze=random.randint(15,45)
    if freeze>0:
        freeze-=1
        bad_target=H*.5-PAD_H/2 + math.sin(frame_no*.11)*78
        right_y += max(-3.0,min(3.0,bad_target-right_y))
    else:
        noisy=ball_y-PAD_H/2 + math.sin(frame_no*.19)*random.uniform(0,18)
        right_y += max(-6.3,min(6.3,noisy-right_y))
    left_y=max(10,min(H-PAD_H-10,left_y)); right_y=max(10,min(H-PAD_H-10,right_y))
    ball_x+=vx; ball_y+=vy
    if ball_y<17:
        ball_y=17; vy=abs(vy)
    if ball_y>H-17:
        ball_y=H-17; vy=-abs(vy)
    # collision
    if vx<0 and LX+PAD_W<=ball_x<=LX+PAD_W+9 and left_y-8<=ball_y<=left_y+PAD_H+8:
        ball_x=LX+PAD_W+9; vx=abs(vx)*1.025
        vy+=(ball_y-(left_y+PAD_H/2))*0.11
    if vx>0 and RX-9<=ball_x<=RX and right_y-8<=ball_y<=right_y+PAD_H+8:
        ball_x=RX-9; vx=-abs(vx)*1.025
        vy+=(ball_y-(right_y+PAD_H/2))*0.11
    vy=max(-8.5,min(8.5,vy))
    trail.append((ball_x,ball_y)); trail=trail[-5:]
    scored=None
    if ball_x<-12:
        right_score+=1; scored='R'
    elif ball_x>W+12:
        left_score+=1; scored='L'
    # 3x speed visual sampling
    if frame_no%3==0: render()
    if scored:
        last_scorer=scored; point_banner=1
        for _ in range(14): render()
        point_banner=0; trail.clear()
        if max(left_score,right_score)<5: serve(-1 if scored=='L' else 1)
# ending card
winner='FOLLOW AI' if left_score>right_score else 'CHAOS AI'
for k in range(45):
    render()
    d=ImageDraw.Draw(frames[-1]); d.rectangle((W//2-108,H//2-38,W//2+108,H//2+38),fill=0,outline=5,width=3)
    d.text((W//2-60,H//2-18),winner+' WINS',font=font,fill=5)
    d.text((W//2-20,H//2+8),f'{left_score} : {right_score}',font=font,fill=3)
os.makedirs('/root/Meyo',exist_ok=True)
frames[0].save('/root/Meyo/pong.gif',save_all=True,append_images=frames[1:],duration=50,loop=0,optimize=True,disposal=2)
with open('/root/Meyo/pong_result.json','w') as f: json.dump({'left_ai':'FOLLOW AI','right_ai':'CHAOS AI (random mistakes)','score':[left_score,right_score],'winner':winner,'gif_frames':len(frames)},f,indent=2)
print(json.dumps({'score':[left_score,right_score],'winner':winner,'frames':len(frames),'bytes':os.path.getsize('/root/Meyo/pong.gif')}))
