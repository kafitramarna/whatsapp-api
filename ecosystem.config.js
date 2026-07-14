/**
 * PM2 Ecosystem Configuration
 * 
 * Production deployment configuration for WhatsApp API Gateway
 * VPS: Ubuntu 24.04 (4 vCPU, 8GB RAM)
 */

module.exports = {
  apps: [
    {
      name: 'whatsapp-api',
      script: 'dist/app.js',
      
      // Instance configuration
      instances: 1, // Single instance to maintain WebSocket connections
      exec_mode: 'fork', // Fork mode for WebSocket compatibility
      
      // Memory management
      max_memory_restart: '6G', // Restart if using more than 6GB (VPS has 8GB)
      
      // Auto restart settings
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        HOST: '127.0.0.1',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        HOST: '127.0.0.1',
      },
      
      // Logging
      log_file: '/var/log/whatsapp-api/combined.log',
      out_file: '/var/log/whatsapp-api/out.log',
      error_file: '/var/log/whatsapp-api/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Node.js settings
      node_args: [
        '--max-old-space-size=6144', // 6GB max heap size
      ],
      
      // Startup handling
      exp_backoff_restart_delay: 1000,
    },
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-vps-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/whatsapp-api.git',
      path: '/var/www/whatsapp-api',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /var/log/whatsapp-api',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
