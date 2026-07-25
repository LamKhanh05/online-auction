// JWT UTILITIES

import jwt from 'jsonwebtoken';
import { JWT_EXPIRY } from '../lib/constants.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'your-refresh-secret-change-in-production';

/**
 * Tạo JWT access token
 * @param {Object} payload - Dữ liệu muốn encode vào token
 * @returns {string} JWT token
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY.ACCESS_TOKEN
  });
};

/**
 * Tạo JWT refresh token
 * @param {Object} payload - Dữ liệu muốn encode vào token
 * @returns {string} JWT refresh token
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: JWT_EXPIRY.REFRESH_TOKEN
  });
};

/**
 * Verify JWT access token
 * @param {string} token - Token cần verify
 * @returns {Object} Payload từ token nếu valid, null nếu invalid
 */
export const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[JWT] Access token verified successfully');
    return decoded;
  } catch (error) {
    console.error('[JWT] Access token verification failed:', error.message);
    return null;
  }
};

/**
 * Verify JWT refresh token
 * @param {string} token - Token cần verify
 * @returns {Object} Payload từ token nếu valid, null nếu invalid
 */
export const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET);
    console.log('[JWT] Refresh token verified successfully');
    return decoded;
  } catch (error) {
    console.error('[JWT] Refresh token verification failed:', error.message);
    return null;
  }
};

/**
 * Tạo cặp tokens (access + refresh)
 * @param {Object} user - User object
 * @returns {Object} { accessToken, refreshToken }
 */
export const generateTokenPair = (user) => {
  try {
    const payload = {
      _id: user._id.toString(),
      email: user.email,
      username: user.username,
      roles: user.roles,
      sellerExpiresAt: user.sellerExpiresAt || null,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    
    console.log('[JWT] Token pair generated successfully for user:', user.email);
    
    return {
      accessToken,
      refreshToken
    };
  } catch (error) {
    console.error('[JWT] Token pair generation failed:', error.message);
    throw error;
  }
};
