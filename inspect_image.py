import os
try:
    from PIL import Image
    has_pil = True
except ImportError:
    has_pil = False

screenshot_path = r"c:\Users\bedir\Desktop\101okey\screenshot_debug.png"

if not os.path.exists(screenshot_path):
    print("Screenshot does not exist.")
elif not has_pil:
    print("PIL not installed, cannot analyze image pixels directly.")
else:
    img = Image.open(screenshot_path)
    width, height = img.size
    print(f"Image dimensions: {width}x{height}")
    
    # We look for a horizontal banner of dark/translucent pixels in the lower half of the image
    # center x is width // 2
    center_x = width // 2
    
    # scan vertically from height//2 to height
    for y in range(height // 2, height):
        r, g, b, *a = img.getpixel((center_x, y))
        # Let's print out rows where the color is dark (from background rgba(0,0,0,0.7) on green board)
        # The green board is radial gradient #0e542d to #051d10 (greenish, low red/blue, medium green)
        # The rack wood is brown (reddish, medium red/green, low blue)
        # The dark banner is very dark (r,g,b < 50)
        if r < 40 and g < 40 and b < 40:
            print(f"Dark pixel at y={y}: RGB=({r},{g},{b})")
