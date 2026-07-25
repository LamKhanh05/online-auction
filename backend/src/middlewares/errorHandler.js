// Middleware: Global Error Handler

/**
 * Global error handling middleware
 * PHẢI là middleware cuối cùng trong express app
 */
export const errorHandler = (err, req, res, next) => {
  try {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Lỗi máy chủ nội bộ';
    const code = err.code || 'INTERNAL_ERROR';

    // Log lỗi chi tiết (trong thực tế nên ghi vào file hoặc external logging service)
    console.error(`[ERROR HANDLER] Status: ${statusCode}, Code: ${code}`);
    console.error(`[ERROR HANDLER] Message: ${message}`);
    console.error(`[ERROR HANDLER] Path: ${req.method} ${req.path}`);
    console.error(`[ERROR HANDLER] Stack:`, err.stack);
    console.error(`[ERROR HANDLER] Details:`, {
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      url: req.originalUrl
    });

    // Xử lý Zod validation errors
    if (err.isValidationError) {
      console.error('[ERROR HANDLER] Zod ValidationError:', err.errors);
      return res.status(400).json({
        status: 'error',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: err.message,
        errors: err.errors
      });
    }

    // Xử lý MongoDB validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      console.error('[ERROR HANDLER] MongoDB ValidationError:', messages);
      return res.status(400).json({
        status: 'error',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu nhập không hợp lệ',
        errors: messages.map(msg => ({ path: 'general', msg }))
      });
    }

    // Xử lý MongoDB duplicate key error
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      console.error('[ERROR HANDLER] MongoDB Duplicate Error:', field);
      return res.status(400).json({
        status: 'error',
        statusCode: 400,
        code: 'DUPLICATE_ERROR',
        message: `${field} đã tồn tại trong hệ thống`
      });
    }

    // Xử lý JWT errors
    if (err.name === 'JsonWebTokenError') {
      console.error('[ERROR HANDLER] JWT Invalid Token Error');
      return res.status(401).json({
        status: 'error',
        statusCode: 401,
        code: 'INVALID_TOKEN',
        message: 'Token không hợp lệ'
      });
    }

    if (err.name === 'TokenExpiredError') {
      console.error('[ERROR HANDLER] JWT Token Expired Error');
      return res.status(401).json({
        status: 'error',
        statusCode: 401,
        code: 'TOKEN_EXPIRED',
        message: 'Token đã hết hạn'
      });
    }

    // Xử lý AppError (custom error)
    res.status(statusCode).json({
      status: 'error',
      statusCode,
      code,
      message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[ERROR HANDLER CRITICAL] Lỗi trong error handler:', error);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Lỗi máy chủ nội bộ',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 404 Not Found Handler
 */
export const notFoundHandler = (req, res) => {
  try {
    console.error(`[404 HANDLER] Không tìm thấy: ${req.method} ${req.path}`);
    res.status(404).json({
      status: 'error',
      statusCode: 404,
      code: 'NOT_FOUND',
      message: `Không tìm thấy: ${req.method} ${req.path}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[404 HANDLER] Lỗi trong 404 handler:', error);
    res.status(500).json({
      status: 'error',
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Lỗi máy chủ nội bộ'
    });
  }
};
