with open('style.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'controls-area' in line:
        print(f"Line {i+1}: {line.strip()}")
