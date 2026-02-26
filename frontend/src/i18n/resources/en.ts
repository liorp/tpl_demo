const enCommon = {
  app: {
    refreshMap: 'REFRESH MAP',
  },
  settings: {
    title: 'Settings',
    description:
      'Configure noise threshold, detection threshold, and gain parameters.',
    noiseThreshold: 'Noise Threshold',
    detectionThreshold: 'Detection Threshold',
    gain: 'Gain',
    send: 'Send',
    alarmSound: 'Alarm Sound',
    alarmSoundHelp: 'Play a short alert sound when alarm is triggered.',
    offlineMode: 'Offline Mode',
    offlineModeHelp:
      'Use local tiles. Disable to fetch maps from the internet.',
    resetAll: 'Reset all',
    close: 'Close',
    language: 'Language',
    languageEnglish: 'English',
    languageHebrew: 'Hebrew',
  },
  configFeedback: {
    noiseSet: 'Noise threshold set to {{value}}',
    noiseNotConnected: 'Not connected — noise threshold not sent',
    detectionSet: 'Detection threshold set to {{value}}',
    detectionNotConnected: 'Not connected — detection threshold not sent',
    gainSet: 'Gain set to {{value}}',
    gainNotConnected: 'Not connected — gain not sent',
  },
  statusStrip: {
    clear: 'ALL CLEAR',
    alarm: 'ALARM',
    commLoss: 'COMM LOSS',
    disconnected: 'DISCONNECTED',
    noSensor: 'NO SENSOR',
    serverOffline: 'SERVER OFFLINE',
    productName: 'TPL SIGNUM',
  },
  connection: {
    tooltipConnected: 'Connected to sensor on port {{port}}',
    tooltipWaiting: 'Server online — waiting for sensor',
    tooltipOffline: 'Server offline — retrying...',
    online: 'Online',
    noSensor: 'No sensor',
    serverOffline: 'Server offline',
  },
  pairings: {
    title: 'Sensor Pairings',
    waiting: 'Waiting for at least 2 units...',
  },
  alerts: {
    crossing: 'Crossing',
    focus: 'Focus',
    ok: 'OK',
    ariaFocus: 'Focus S{{sensorA}} × S{{sensorB}}',
    ariaOk: 'OK S{{sensorA}} × S{{sensorB}}',
  },
  events: {
    title: 'System Events',
    entriesCount: '{{count}} entries',
  },
  errors: {
    sectionFailed: '{{section}} failed to render',
    retry: 'Retry',
  },
  map: {
    status: 'STATUS',
    sensorTitle: 'Sensor #{{id}}',
    lastHeartbeat: 'Last heartbeat: {{value}}',
    noPeerLinks: 'No peer links',
    link: 'Link {{side1}} -> {{side2}}',
    direction: 'Direction: {{value}}',
    rssi: 'RSSI: {{value}}dBm',
    threshold: 'Threshold: {{value}}',
    dt: 'DT: {{value}}',
    updatedAt: 'Updated at: {{value}}',
    offlineMissing: 'Offline map tiles are unavailable.',
  },
} as const;

export default enCommon;
