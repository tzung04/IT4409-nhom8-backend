import crypto from 'crypto';

/**
 * Generate signed hash cho dashboard URL
 * @param {number} userId - ID của user
 * @param {string} deviceSerials - Chuỗi device serials (comma separated)
 * @param {number} expiresIn - Thời gian expire (giây), mặc định 2 giờ
 * @returns {Object} { hash, exp }
 */
export const generateDashboardHash = (userId, deviceSerials, expiresIn = 7200) => {
  // Tạo timestamp expire (2 giờ = 7200 giây)
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  
  // Tạo chuỗi để hash: userId + devices + timestamp + secret
  const data = `${userId}:${deviceSerials}:${exp}`;
  
  // Generate HMAC SHA256 hash
  const hash = crypto
    .createHmac('sha256', process.env.DASHBOARD_SECRET)
    .update(data)
    .digest('hex');
  
  return { hash, exp };
};

/**
 * Verify hash từ dashboard URL
 * @param {string} hash - Hash từ URL
 * @param {number} userId - User ID từ URL
 * @param {string} deviceSerials - Device serials từ URL
 * @param {number} exp - Timestamp expire từ URL
 * @returns {Object} { valid, reason }
 */
export const verifyDashboardHash = (hash, userId, deviceSerials, exp) => {
  // 1. Check expire
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return { valid: false, reason: 'Hash expired' };
  }
  
  // 2. Regenerate hash với cùng data
  const data = `${userId}:${deviceSerials}:${exp}`;
  const expectedHash = crypto
    .createHmac('sha256', process.env.DASHBOARD_SECRET)
    .update(data)
    .digest('hex');
  
  // 3. Compare hash (constant-time comparison để tránh timing attacks)
  const valid = crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
  
  if (!valid) {
    return { valid: false, reason: 'Invalid hash signature' };
  }
  
  return { valid: true };
};