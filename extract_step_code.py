import json

log_path = r"C:\Users\bedir\.gemini\antigravity\brain\3f565452-25a4-4037-9c3e-b76ed82c9e64\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        step = json.loads(line)
        if i == 418:
            print("Step 418 line found!")
            tcs = step.get('tool_calls', [])
            if tcs:
                args = tcs[0].get('args', {})
                content = args.get('CodeContent', '')
                with open('step_418_index.html', 'w', encoding='utf-8') as out:
                    out.write(content)
                print("Saved step_418_index.html")
        if i == 420:
            print("Step 420 line found!")
            tcs = step.get('tool_calls', [])
            if tcs:
                args = tcs[0].get('args', {})
                content = args.get('CodeContent', '')
                with open('step_420_style.css', 'w', encoding='utf-8') as out:
                    out.write(content)
                print("Saved step_420_style.css")
