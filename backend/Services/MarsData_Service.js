const fs = require('fs');
const path = require('path');

// Read the mission locations from the same file used by the API server.
const localDataPath = path.join(__dirname, '../Data/marsData.json');
const mockMarsData = JSON.parse(fs.readFileSync(localDataPath, 'utf8'));

module.exports = {
  // Find mission information by its key (for example, "jezero_crater").
  getMissionData: async function(siteKey) {
    const key = siteKey.toLowerCase();
    const siteData = mockMarsData[key];

    // Tell the caller clearly when the requested site is not in the data file.
    if (!siteData) {
      throw new Error(`Mission site '${siteKey}' not supported.`);
    }

    return {
      // This label indicates that the information came from the local file,
      // rather than from a live connection to Mars.
      source: "LOCAL_SCIENTIFIC_CACHE",
      data: siteData
    };
  }
};