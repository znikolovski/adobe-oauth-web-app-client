#!/bin/bash

# Exit on error
set -e

echo "Setting up OAuth Client..."

# Generate SSL certificates if they don't exist
if [ ! -f "certs/server.key" ] || [ ! -f "certs/server.crt" ]; then
    echo "Generating SSL certificates..."
    mkdir -p certs
    
    # Generate self-signed certificate for development
    openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.crt \
        -days 365 -nodes -subj "/CN=localhost"
    
    echo "SSL certificates generated successfully!"
else
    echo "SSL certificates already exist, skipping generation."
fi

echo "Setup completed successfully!" 