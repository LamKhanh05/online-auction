// MIDDLEWARE: Role-Based Access Control (RBAC)

import { AppError } from "../utils/errors.js";
import { ERROR_CODES } from "../lib/constants.js";

/**
 * Middleware kiểm tra xem user có role được phép không
 * Sử dụng: authorize('seller', 'admin')
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return next(
          new AppError(
            "Please login to continue",
            401,
            ERROR_CODES.UNAUTHORIZED
          )
        );
      }

      // Kiểm tra nếu user có một trong các role được phép
      const hasRole = allowedRoles.some((role) =>
        req.user.roles?.includes(role)
      );

      if (!hasRole) {
        return next(
          new AppError(
            "You do not have permission to perform this action",
            403,
            ERROR_CODES.FORBIDDEN
          )
        );
      }

      next();
    } catch (error) {
      console.error("[AUTHORIZE MIDDLEWARE] Permission check error:", error);
      next(error);
    }
  };
};

/**
 * Middleware chỉ cho phép seller hoặc admin thao tác trên sản phẩm của họ
 * Kiểm tra xem user có phải là chủ sản phẩm không
 */
export const isProductOwner = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { Product } = await import("../models/index.js");

    const product = await Product.findById(productId);
    if (!product) {
      return next(new AppError("Product not found", 404));
    }

    // Nếu không phải seller chủ sản phẩm và không phải admin
    if (
      !product.sellerId.equals(req.user._id) &&
      !req.user.roles?.includes("admin")
    ) {
      return next(
        new AppError(
          "You do not have permission to edit this product",
          403,
          ERROR_CODES.FORBIDDEN
        )
      );
    }

    req.product = product;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware chỉ cho phép user xem/sửa profile của chính họ (ngoại trừ admin)
 */
export const isUserOwner = (req, res, next) => {
  try {
    const { userId } = req.params;

    if (req.user._id !== userId && !req.user.roles?.includes("admin")) {
      return next(
        new AppError(
          "Bạn không có quyền truy cập profile này",
          403,
          ERROR_CODES.FORBIDDEN
        )
      );
    }

    next();
  } catch (error) {
    console.error(
      "[USER OWNER MIDDLEWARE] Lỗi kiểm tra chủ sở hữu user:",
      error
    );
    next(error);
  }
};

/**
 * Middleware kiểm tra xem order có liên quan đến user không
 * (user là buyer hoặc seller)
 */
export const isOrderParticipant = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { Order } = await import("../models/index.js");

    const order = await Order.findById(orderId);
    if (!order) {
      return next(new AppError("Đơn hàng không tồn tại", 404));
    }

    // Chỉ buyer, seller hoặc admin mới được xem
    if (
      !order.buyerId.equals(req.user._id) &&
      !order.sellerId.equals(req.user._id) &&
      !req.user.roles?.includes("admin")
    ) {
      return next(
        new AppError(
          "Bạn không có quyền xem đơn hàng này",
          403,
          ERROR_CODES.FORBIDDEN
        )
      );
    }

    req.order = order;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware kiểm tra seller role có còn hợp lệ không (chưa hết hạn)
 * Sử dụng cho các hành động yêu cầu seller role như đăng sản phẩm mới
 */
export const checkSellerExpiration = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(
        new AppError("Vui lòng đăng nhập", 401, ERROR_CODES.UNAUTHORIZED)
      );
    }

    // Admin bypass seller expiration check
    if (req.user.roles?.includes("admin")) {
      return next();
    }

    // Kiểm tra xem user có role seller không
    if (!req.user.roles?.includes("seller")) {
      return next(
        new AppError(
          "Bạn cần quyền seller để thực hiện hành động này",
          403,
          ERROR_CODES.FORBIDDEN
        )
      );
    }

    // Live verification from database if needed or check token payload
    let expiresAt = req.user.sellerExpiresAt;
    if (!expiresAt) {
      const { User } = await import("../models/index.js");
      const dbUser = await User.findById(req.user._id).select("sellerExpiresAt roles").lean();
      if (!dbUser?.roles?.includes("seller")) {
        return next(
          new AppError(
            "Bạn cần quyền seller để thực hiện hành động này",
            403,
            ERROR_CODES.FORBIDDEN
          )
        );
      }
      expiresAt = dbUser?.sellerExpiresAt;
    }

    // Kiểm tra seller expiration
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return next(
        new AppError(
          "Quyền seller của bạn đã hết hạn. Vui lòng yêu cầu gia hạn.",
          403,
          ERROR_CODES.FORBIDDEN
        )
      );
    }

    next();
  } catch (error) {
    console.error(
      "[CHECK SELLER EXPIRATION] Lỗi kiểm tra seller expiration:",
      error
    );
    next(error);
  }
};
