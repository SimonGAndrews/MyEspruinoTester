// String split/join checks (sync)
var s = 'alpha,beta,gamma';
var parts = s.split(',');
result = parts.length===3 && parts[0]==='alpha' && parts[2]==='gamma' && parts.join('|')==='alpha|beta|gamma';
if (!result) resultReason = 'string split/join failed';
