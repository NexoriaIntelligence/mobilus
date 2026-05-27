module.exports = {
  apps: [
    {
      name: 'mobilus-tcp-gateway',
      script: './dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        TCP_PORT: '5000',
        ADMIN_PORT: '3000',
        METRICS_PORT: '9090',
        REDIS_URL: 'redis://localhost:6379',
        TELEMETRY_API_URL: 'https://telemetry-api.mobilus.com/api/ingest',
        MAX_CONNECTIONS: '50000',
        SOCKET_TIMEOUT: '300000',
        HEARTBEAT_INTERVAL: '30000',
        LOG_LEVEL: 'info'
      },
      max_memory_restart: '2G',
      watch: false,
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
