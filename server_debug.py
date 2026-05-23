import http.server
import socketserver
import subprocess
import time
import sys
import os

PORT = 8085
log_messages = []

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/log':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length).decode('utf-8')
            print(f"[BROWSER LOG]: {post_data}")
            sys.stdout.flush()
            log_messages.append(post_data)
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b"OK")
        else:
            self.send_response(404)
            self.end_headers()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run_server():
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    inject_script = """
    <script>
    (function() {
        function sendLog(type, msg) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'http://localhost:8085/log', false); // synchronous to make sure it sends
            xhr.setRequestHeader('Content-Type', 'text/plain');
            xhr.send(JSON.stringify({ type: type, message: msg }));
        }

        window.onerror = function(message, source, lineno, colno, error) {
            sendLog('error', message + ' at ' + source + ':' + lineno + ':' + colno + (error ? '\\nStack: ' + error.stack : ''));
            return false;
        };

        var origLog = console.log;
        console.log = function() {
            var args = Array.prototype.slice.call(arguments).map(String).join(' ');
            origLog.apply(console, arguments);
            sendLog('log', args);
        };

        var origError = console.error;
        console.error = function() {
            var args = Array.prototype.slice.call(arguments).map(String).join(' ');
            origError.apply(console, arguments);
            sendLog('error', args);
        };
        
        console.log("Hooks injected!");
    })();
    </script>
    """

    html_mod = html.replace('<head>', '<head>' + inject_script)
    with open('index_debug.html', 'w', encoding='utf-8') as f:
        f.write(html_mod)

    os.rename('index.html', 'index_orig.html')
    os.rename('index_debug.html', 'index.html')

    try:
        handler = CustomHandler
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            print(f"Serving at port {PORT}")
            sys.stdout.flush()
            chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            cmd = [chrome_path, "--headless", "--disable-gpu", "--no-sandbox", f"http://localhost:{PORT}/index.html"]
            
            with open('chrome_stdout.log', 'w') as f_out, open('chrome_stderr.log', 'w') as f_err:
                p = subprocess.Popen(cmd, stdout=f_out, stderr=f_err)
                time.sleep(5)
                p.terminate()
            
            httpd.server_close()
    finally:
        if os.path.exists('index_orig.html'):
            if os.path.exists('index.html'):
                os.remove('index.html')
            os.rename('index_orig.html', 'index.html')

if __name__ == '__main__':
    run_server()
