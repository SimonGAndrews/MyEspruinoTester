// Exercise wifi.getStatus() and wifi.getDetails() return shapes useful for diagnostics
try {
  var wifi = require('Wifi');
  var hasStatus = typeof wifi.getStatus === 'function';
  var hasDetails = typeof wifi.getDetails === 'function';
  if (!hasStatus && !hasDetails) {
    result = true;
    resultReason = 'Status/details helpers not available on this build';
  } else {
    var issues = [];
    if (hasStatus) {
      try {
        var status = wifi.getStatus();
        var statusType = typeof status;
        if (!status && status !== 0) {
          issues.push('wifi.getStatus returned falsy value');
        } else if (statusType === 'object') {
          var hasStation = Object.prototype.hasOwnProperty.call(status, 'station');
          var hasAp = Object.prototype.hasOwnProperty.call(status, 'ap');
          var hasMode = Object.prototype.hasOwnProperty.call(status, 'mode');
          if (!hasStation && !hasAp && !hasMode) {
            issues.push('wifi.getStatus object missing station/ap/mode fields');
          }
        } else if (statusType !== 'string') {
          issues.push('wifi.getStatus returned unexpected type ' + statusType);
        }
      } catch (statusErr) {
        issues.push('wifi.getStatus threw: ' + (statusErr && statusErr.message || statusErr));
      }
    }
    if (hasDetails) {
      try {
        var details = wifi.getDetails();
        var detailType = typeof details;
        if (details === undefined) {
          issues.push('wifi.getDetails returned undefined');
        } else if (details === null) {
          // null is acceptable (no details available)
        } else if (detailType === 'string') {
          // string return indicates a status constant (acceptable)
        } else if (detailType === 'object') {
          var hasStationDetail = Object.prototype.hasOwnProperty.call(details, 'station');
          var hasApDetail = Object.prototype.hasOwnProperty.call(details, 'ap');
          var hasStatusField = Object.prototype.hasOwnProperty.call(details, 'status');
          var hasClients = Object.prototype.hasOwnProperty.call(details, 'apClients');
          if (!hasStationDetail && !hasApDetail && !hasStatusField && !hasClients) {
            issues.push('wifi.getDetails object missing station/ap/status/apClients fields');
          }
        } else {
          issues.push('wifi.getDetails returned unexpected type ' + detailType);
        }
      } catch (detailsErr) {
        issues.push('wifi.getDetails threw: ' + (detailsErr && detailsErr.message || detailsErr));
      }
    }
    result = issues.length === 0;
    if (!result) resultReason = issues.join('; ');
  }
} catch (e) {
  result = false;
  resultReason = 'wifi.getStatus/getDetails test threw: ' + (e && e.message || e);
}
