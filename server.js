const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3333;
const DIR = __dirname;

const MIME = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
};

http
	.createServer((req, res) => {
		const url = req.url.split('?')[0];
		const resolved = url === '/' ? '/index.html' : url;
		const filePath = path.join(DIR, resolved);

		// Prevent directory traversal
		if (!filePath.startsWith(DIR)) {
			res.writeHead(403);
			return res.end('Forbidden');
		}

		fs.readFile(filePath, (err, data) => {
			if (err) {
				res.writeHead(404);
				return res.end('Not found');
			}
			const ext = path.extname(filePath).toLowerCase();
			res.writeHead(200, {
				'Content-Type': MIME[ext] || 'application/octet-stream',
			});
			res.end(data);
		});
	})
	.listen(PORT, () => {
		console.log(`Outbound running at http://localhost:${PORT}`);
	});
