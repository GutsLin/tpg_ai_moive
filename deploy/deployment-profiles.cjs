const deploymentProfiles = {
  prod: {
    profile: 'prod',
    composeProjectName: 'narrix-prod',
    networkName: 'narrix_prod_net',
    frontendPort: 8080,
    backendPort: 3000,
    database: {
      containerName: 'postgres',
      databaseName: 'narrix_prod',
      username: 'narrix_prod',
      volumeName: 'narrix_prod_pgdata',
    },
    redis: {
      containerName: 'redis',
      volumeName: 'narrix_prod_redisdata',
    },
  },
  dev: {
    profile: 'dev',
    composeProjectName: 'narrix-dev',
    networkName: 'narrix_dev_net',
    frontendPort: 18080,
    backendPort: 13000,
    database: {
      containerName: 'postgres',
      databaseName: 'narrix_dev',
      username: 'narrix_dev',
      volumeName: 'narrix_dev_pgdata',
    },
    redis: {
      containerName: 'redis',
      volumeName: 'narrix_dev_redisdata',
    },
  },
}

module.exports = deploymentProfiles
