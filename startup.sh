#!/bin/bash
cd ~/SniperBot

echo "================================================"
echo "🔧 Setting up SSL for sniperbot.space"
echo "================================================"

echo ""
echo "1️⃣ Copying certificates..."
sudo mkdir -p /etc/ssl/cloudflare
sudo cp cert.pem /etc/ssl/cloudflare/
sudo cp cert.key /etc/ssl/cloudflare/
sudo chmod 644 /etc/ssl/cloudflare/cert.pem
sudo chmod 600 /etc/ssl/cloudflare/cert.key
echo "✅ Certificates copied"

echo ""
echo "2️⃣ Creating Nginx config..."
sudo tee /etc/nginx/sites-available/sniperbot.space >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name sniperbot.space www.sniperbot.space;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sniperbot.space www.sniperbot.space;

    ssl_certificate /etc/ssl/cloudflare/cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare/cert.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:4028;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

echo "✅ Nginx config created"

echo ""
echo "3️⃣ Enabling site..."
sudo ln -sf /etc/nginx/sites-available/sniperbot.space /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo ""
echo "4️⃣ Testing Nginx..."
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded!"
else
    echo "❌ Nginx test failed!"
    exit 1
fi

echo ""
echo "5️⃣ Checking services..."
echo "Nginx on port 443:"
sudo netstat -tlnp | grep :443
echo ""
echo "App on port 4028:"
sudo netstat -tlnp | grep :4028

echo ""
echo "6️⃣ Testing access..."
echo "HTTP (should redirect to HTTPS):"
curl -s -o /dev/null -w "Status: %{http_code}\n" http://sniperbot.space
echo "HTTPS:"
curl -k -s -o /dev/null -w "Status: %{http_code}\n" https://sniperbot.space

echo ""
echo "================================================"
echo "✅ Setup complete!"
echo "🌐 Visit: https://sniperbot.space"
echo ""
echo "⚠️ In Cloudflare Dashboard:"
echo "   SSL/TLS → Overview → Set to 'Full' (since you have certs)"
echo "================================================"