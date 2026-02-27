/**
 * AWS Backend Configuration
 * Auto-generated from CDK outputs
 */

export const awsConfig = {
  apiUrl: 'https://cs13rcc3zf.execute-api.us-east-1.amazonaws.com/dev',
  wsUrl: 'wss://6dhmrcfxca.execute-api.us-east-1.amazonaws.com/dev',
  cognito: {
    userPoolId: 'us-east-1_KM6It9eB1',
    clientId: '3dj7i6stbnakdf13uelicqvnke',
    domain: 'vibesdk-dev',
    region: 'us-east-1',
    hostedUiUrl: 'https://vibesdk-dev.auth.us-east-1.amazoncognito.com',
  },
};

export const isAwsBackend = () => {
  return import.meta.env.VITE_BACKEND === 'aws';
};
