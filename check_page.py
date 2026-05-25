import subprocess
import time
import os

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
html_path = r"C:\Users\bedir\Desktop\101okey\index.html"
screenshot_path = r"C:\Users\bedir\Desktop\101okey\screenshot_debug.png"
dom_path = r"C:\Users\bedir\Desktop\101okey\body_dump.html"

# Run chrome headlessly to dump DOM and take screenshot
cmd = [
    chrome_path,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    f"--screenshot={screenshot_path}",
    "--window-size=1920,1080",
    f"file:///{html_path}?offline=1"
]

print("Launching Chrome...")
p = subprocess.Popen(cmd)
time.sleep(4)
p.terminate()

# Now check if screenshot and DOM dump were created
if os.path.exists(screenshot_path):
    print(f"Screenshot created at {screenshot_path}, size={os.path.getsize(screenshot_path)} bytes")
else:
    print("Screenshot was NOT created.")

# To get the DOM, we can run chrome with --dump-dom
cmd_dom = [
    chrome_path,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--dump-dom",
    f"file:///{html_path}?offline=1"
]

print("Dumping DOM...")
try:
    res = subprocess.run(cmd_dom, capture_output=True, text=True, timeout=5)
    with open(dom_path, 'w', encoding='utf-8') as f:
        f.write(res.stdout)
    print(f"DOM dumped to {dom_path}, size={os.path.getsize(dom_path)} bytes")
except Exception as e:
    print("Error dumping DOM:", e)
