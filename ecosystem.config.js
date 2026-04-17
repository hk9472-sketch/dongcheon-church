// PM2 배포 설정
// 사용법:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup
module.exports = {
  apps: [
    {
      name: "dongcheon",
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
