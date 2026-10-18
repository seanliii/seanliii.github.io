"""Player-intent checks: real keys/touches, screenshots, no synthetic game state."""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import time
from zoneinfo import ZoneInfo

ROOT = Path(__file__).parent / "test-output"


def run(context, url, label, *, mobile=False):
    ROOT.mkdir(exist_ok=True)
    record = {
        "at": datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(),
        "url": url, "mobile_browser_emulation": mobile,
        "checks": {}, "errors": [], "actions": [], "screenshots": [],
        "model_requests": 0, "game_state_written_by_verifier": False,
    }
    page = context.new_page()
    page.set_viewport_size({"width": 390 if mobile else 1366, "height": 844 if mobile else 768})
    page.set_default_timeout(7000)
    page.on("pageerror", lambda error: record["errors"].append(str(error)[:400]))
    cdp = context.new_cdp_session(page)
    # Playwright keeps every page focused by default. Allow real tab switches to
    # emit blur/visibility events instead of incorrectly reporting a product failure.
    cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": False})
    if mobile:
        cdp.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    started = time.monotonic()

    def state():
        return page.evaluate("""() => {
          const p=window.__PELICAN__,s=p.S;
          const dx=p.CAM.look.x-p.CAM.pos.x,dz=p.CAM.look.z-p.CAM.pos.z;
          return {lane:s.lane,steer:s.steer,speed:s.speed,dist:s.dist,
            paused:s.paused,started:s.started,jumps:s.jumpCount,grounded:s.grounded,
            bells:s.bellCount,trickT:s.trickT,camMode:s.camMode,
            quality:s.quality,
            camera:document.querySelector('#camName').textContent,touch:s.touch,
            viewRightX:-dz/Math.hypot(dx,dz),muted:s.muted,
            audioState:p.AudioEngine.ctx?.state,
            masterGain:p.AudioEngine.master?.gain.value};
        }""")

    def screenshot(name):
        path = ROOT / f"{label}-{name}.png"
        page.screenshot(path=path)
        record["screenshots"].append(str(path))

    def hold(key, ms):
        page.keyboard.down(key)
        page.wait_for_timeout(ms)
        page.keyboard.up(key)

    def button_center(selector):
        return page.locator(selector).evaluate("""e=>{
          const r=e.getBoundingClientRect();
          const x=r.left+r.width/2,y=r.top+r.height/2;
          const top=document.elementFromPoint(x,y);
          return {x,y,width:r.width,height:r.height,within:x>=0&&x<innerWidth&&y>=0&&y<innerHeight,
            unobstructed:!!top&&(e===top||e.contains(top))};
        }""")

    def touch(selector, ms=100):
        center = button_center(selector)
        record["actions"].append({"touch": selector, "center": center})
        if not center["within"] or not center["unobstructed"]:
            return False
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [
            {"x": center["x"], "y": center["y"], "radiusX": 4, "radiusY": 4, "id": 0}
        ]})
        page.wait_for_timeout(ms)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        return True

    try:
        response = page.goto(url, wait_until="domcontentloaded", timeout=25000)
        page.bring_to_front()
        assert response and response.status == 200
        record["http"] = response.status
        record["html_sha256"] = hashlib.sha256(response.body()).hexdigest()
        page.evaluate("""() => {
          window.__controlFocusEvidence = [];
          window.addEventListener('blur', () => window.__controlFocusEvidence.push({event:'blur', hidden:document.hidden}));
          document.addEventListener('visibilitychange', () => window.__controlFocusEvidence.push({event:'visibility',hidden:document.hidden}));
        }""")
        page.wait_for_function("document.querySelector('#startBtn')?.classList.contains('ready')", timeout=15000)
        page.locator("#startBtn").click()
        page.wait_for_function("window.__PELICAN__?.S.started === true")
        before_mute = state()["muted"]
        page.locator("#muteBtn").click()
        record["checks"]["mute_button_works"] = state()["muted"] != before_mute
        before_quality = state()["quality"]
        page.locator("#qualityTag").click()
        record["checks"]["quality_button_works"] = state()["quality"] == (before_quality + 2) % 3
        if not state()["muted"]:
            page.keyboard.press("m")
        if mobile:
            page.wait_for_timeout(950)
            selectors = ["#tLeft", "#tRight", "#tDown", "#tUp", "#tJump", "#tBell", "#tCam", "#tTrick"]
            geometry = {selector: button_center(selector) for selector in selectors}
            record["touch_buttons"] = geometry
            record["checks"]["touch_controls_visible_and_unobstructed"] = all(
                value["within"] and value["unobstructed"] for value in geometry.values()
            )
            record["checks"]["mobile_stats_not_covered"] = page.locator("#stats").evaluate("""e=>{
              const r=e.getBoundingClientRect(), q=document.querySelector('#topRight').getBoundingClientRect();
              return r.right<=q.left || q.right<=r.left || r.bottom<=q.top || q.bottom<=r.top;
            }""")
            screenshot("touch-layout")
            for selector, sign in (("#tLeft", -1), ("#tRight", 1)):
                before = state()
                touched = touch(selector, 320)
                after = state()
                record["actions"].append({"button": selector, "before": before, "after": after})
                record["checks"][selector[1:] + "_direction"] = touched and sign * (after["lane"] - before["lane"]) > 0.015
                page.wait_for_timeout(400)
            before = state()
            touched = touch("#tJump")
            record["checks"]["touch_jump"] = touched and state()["jumps"] == before["jumps"] + 1
            before = state()
            touched = touch("#tBell")
            record["checks"]["touch_bell"] = touched and state()["bells"] == before["bells"] + 1
            before = state()
            touched = touch("#tCam")
            record["checks"]["touch_camera"] = touched and state()["camMode"] != before["camMode"]
            # Switching tabs is a normal mobile interruption. It must be possible to resume without a keyboard.
            other = context.new_page()
            other.goto("about:blank")
            other.bring_to_front()
            page.wait_for_timeout(250)
            record["background_focus"] = page.evaluate("({focus:document.hasFocus(),visibility:document.visibilityState})")
            page.bring_to_front()
            other.close()
            page.wait_for_timeout(200)
            record["checks"]["background_pauses"] = state()["paused"]
            record["checks"]["real_background_event_observed"] = not record["background_focus"]["focus"]
            if page.locator("#resumeBtn").count():
                tapped = touch("#resumeBtn")
                if tapped:
                    page.wait_for_function("window.__PELICAN__.S.paused === false", timeout=2000)
                record["checks"]["touch_resume"] = tapped and not state()["paused"]
            else:
                record["checks"]["touch_resume"] = False
            screenshot("touch-after-return")
        else:
            hold("w", 550)
            page.wait_for_timeout(100)
            for key, sign in (("a", -1), ("d", 1), ("ArrowLeft", -1), ("ArrowRight", 1)):
                before = state()
                hold(key, 300)
                after = state()
                delta = after["lane"] - before["lane"]
                record["actions"].append({"key": key, "expected_direction": "left" if sign < 0 else "right",
                                          "delta_lane": delta, "before": before, "after": after})
                record["checks"][key + "_direction"] = sign * delta > 0.03 and after["viewRightX"] > 0
                if key in ("a", "d"):
                    screenshot(key + "-direction")
                page.wait_for_timeout(420)
            for up, down in (("w", "s"), ("ArrowUp", "ArrowDown")):
                before = state()
                hold(up, 450)
                accelerated = state()
                hold(down, 650)
                braked = state()
                record["checks"][up + "_accelerates"] = accelerated["speed"] > before["speed"]
                record["checks"][down + "_brakes"] = braked["speed"] < accelerated["speed"]
            before = state()
            page.keyboard.press("Space")
            page.wait_for_timeout(80)
            page.keyboard.press("Space")
            record["checks"]["single_jump_while_airborne"] = state()["jumps"] == before["jumps"] + 1
            page.keyboard.press("b")
            record["checks"]["bell"] = state()["bells"] == before["bells"] + 1
            cameras = []
            for _ in range(4):
                current = state()["camMode"]
                page.keyboard.press("c")
                page.wait_for_function("(old)=>window.__PELICAN__.S.camMode!==old", arg=current)
                page.wait_for_timeout(100)
                cameras.append(state()["camera"])
            record["checks"]["four_camera_modes"] = len(set(cameras)) == 4
            page.keyboard.down("p")
            page.keyboard.down("p")
            record["checks"]["holding_pause_does_not_toggle_back"] = state()["paused"]
            page.keyboard.up("p")
            before = state()
            page.wait_for_timeout(250)
            record["checks"]["pause_stops_progress"] = state()["dist"] == before["dist"]
            page.keyboard.press("p")
            page.wait_for_timeout(150)
            record["checks"]["resume_progresses"] = state()["dist"] > before["dist"]
            # Key-up may be lost while the browser is in the background.
            page.keyboard.down("a")
            page.wait_for_timeout(150)
            other = context.new_page()
            other.goto("about:blank")
            other.bring_to_front()
            page.wait_for_timeout(180)
            record["background_focus"] = page.evaluate("({focus:document.hasFocus(),visibility:document.visibilityState})")
            other.keyboard.up("a")
            page.bring_to_front()
            other.close()
            page.wait_for_timeout(150)
            record["checks"]["blur_pauses"] = state()["paused"]
            record["checks"]["real_blur_observed"] = not record["background_focus"]["focus"]
            if state()["paused"]:
                page.keyboard.press("p")
            page.wait_for_timeout(550)
            released = state()
            record["checks"]["no_stuck_steering_after_blur"] = abs(released["steer"]) < 0.1
            record["release_state"] = released
            page.keyboard.up("a")
        record["checks"]["no_script_error"] = not record["errors"]
        record["focus_evidence"] = page.evaluate("window.__controlFocusEvidence")
        record["passed"] = all(record["checks"].values())
    except Exception as error:
        record.update(passed=False, error_type=type(error).__name__, error=str(error)[:700])
        try:
            screenshot("failure")
        except Exception:
            pass
    finally:
        page.close()
        record["test_tab_closed"] = True
        record["elapsed_s"] = round(time.monotonic() - started, 3)
        (ROOT / f"{label}-result.json").write_text(json.dumps(record, ensure_ascii=False, indent=2))
    print(json.dumps({key:record[key] for key in ("at","checks","passed","elapsed_s") if key in record},ensure_ascii=False))
    return record


if __name__ == "__main__":
    import argparse
    from playwright.sync_api import sync_playwright

    parser = argparse.ArgumentParser(description="用真实键盘与触屏模拟验收方向、暂停和手机布局")
    parser.add_argument("url", help="已启动的本游戏网页，不会调用任何模型")
    parser.add_argument("--output", type=Path, default=ROOT)
    args = parser.parse_args()
    ROOT = args.output
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False, chromium_sandbox=True)
        try:
            context = browser.new_context()
            desktop = run(context, args.url, "desktop")
            mobile = run(context, args.url, "mobile", mobile=True)
        finally:
            browser.close()
    raise SystemExit(0 if desktop["passed"] and mobile["passed"] else 1)
