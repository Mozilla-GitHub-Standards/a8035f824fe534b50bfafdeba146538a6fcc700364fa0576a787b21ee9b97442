// loads zipped CSV file from (1M alexa top sites)
// converts to JS array

const alexaUrl = 'http://s3.amazonaws.com/alexa-static/top-1m.csv.zip';

// fetches records from alexa top sites (`alexaUrl`)
// converts to an array and returns
function fetchTopSites() {
  // XXX write this part
  return new Promise((resolve, reject) => {
    throw new Error('not implemented' + alexaUrl + resolve + reject);
  });
}

export default {
  fetchTopSites,
};
