export const getStatusColor = (status: string) => {
  switch (status) {
    case 'PENDING': return '#fbbc04';
    case 'IN_PROGRESS': return '#4285f4';
    case 'DOWNLOADED': return '#34a853';
    case 'ERROR': return '#ea4335';
    default: return '#5f6368';
  }
};

export const getStatusIcon = (status: string) => {
  switch (status) {
    case 'PENDING': return '⏳';
    case 'IN_PROGRESS': return '⚙️';
    case 'DOWNLOADED': return '✅';
    case 'ERROR': return '❌';
    default: return '❓';
  }
};
