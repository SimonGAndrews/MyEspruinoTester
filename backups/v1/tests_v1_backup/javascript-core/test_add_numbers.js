// Simple arithmetic checks (sync)
var a = 40 + 2;
var b = 10 * 5 - 8;
var c = (1+2+3+4+5+6);
result = (a===42) && (b===42) && (c===21);
if (!result) resultReason = 'arithmetic mismatch';
