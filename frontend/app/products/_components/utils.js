// ============================================
// UTILITY FUNCTIONS & CONSTANTS
// ============================================

import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
// import Navigation from '../../components/navigation';

export const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop";

// Thời gian hiển thị badge "Mới đăng" (phút)
export const NEW_PRODUCT_THRESHOLD_MINUTES = 60; // 60 phút = 1 giờ

// Sort options - sync với backend API
export const SORT_OPTIONS = [
  { label: "Mới nhất", value: "newest" },
  { label: "Giá: Thấp → Cao", value: "price_asc" },
  { label: "Giá: Cao → Thấp", value: "price_desc" },
  { label: "Nhiều lượt đấu giá", value: "bids" },
  { label: "Sắp kết thúc", value: "ending" },
];

export const formatPrice = (price) => {
  if (!price) return "N/A";
  return `${price.toLocaleString("vi-VN")} VNĐ`;
};

export const calculateTimeLeft = (endDate) => {
  if (!endDate) return "N/A";
  const end = new Date(endDate);
  const now = new Date();
  if (end <= now) return "Đã kết thúc";

  const diff = end - now;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  return `${minutes} phút`;
};

/**
 * Kiểm tra xem sản phẩm có được đăng trong N phút gần đây không
 * @param {string|Date} createdAt - Thời gian tạo sản phẩm
 * @param {number} thresholdMinutes - Ngưỡng thời gian (phút)
 * @returns {boolean}
 */
export const isNewProduct = (createdAt, thresholdMinutes = NEW_PRODUCT_THRESHOLD_MINUTES) => {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const now = new Date();
  const minutesSinceCreation = (now - created) / (1000 * 60);
  return minutesSinceCreation >= 0 && minutesSinceCreation <= thresholdMinutes;
};

const getImageUrl = (url) => {
  if (!url) return "/placeholder.svg";
  if (url.startsWith("data:")) return url; // Base64
  if (url.startsWith("http")) return url; // External URL
  if (url.startsWith("/uploads")) {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
    const domainBase = apiBase.replace(/\/api\/?$/, "");
    return `${domainBase}${url}`; // Local upload
  }
  return url;
};

export const transformProductData = (product) => {
  // Prefer rating from seller's ratingSummary if available, otherwise use product.rating
  // or compute average from product.reviews as a fallback. Normalize to 0..5 scale.
  // Prefer explicit normalized seller rating returned by backend, then seller.ratingSummary.score,
  // then product.rating, then compute average from product.reviews.
  const rawRating =
    product.seller?.rating ??
    product.seller?.ratingSummary?.score ??
    product.rating ??
    (product.reviews && product.reviews.length
      ? product.reviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
        product.reviews.length
      : null);

  let ratingValue = null;
  if (rawRating !== null && rawRating !== undefined) {
    const num = Number(rawRating) || 0;
    // If backend score is a fraction (0..1), convert to 0..5 scale
    ratingValue =
      num <= 1 ? Number((num * 5).toFixed(1)) : Number(num.toFixed(1));
  }

  return {
    id: product._id,
    name: product.title,
    category:
      product.category?.name || product.categoryId?.name || "Uncategorized",
    price: product.auction?.currentPrice || product.auction?.startPrice || 0,
    bids: product.auction?.bidCount || 0,
    timeLeft: calculateTimeLeft(product.auction?.endAt),
    image: getImageUrl(product.primaryImageUrl || product.imageUrls?.[0]),
    rating: ratingValue !== null ? Number(ratingValue.toFixed(1)) : null,
    images: product.imageUrls,
    description: product.descriptionHistory?.[0]?.text,
    auction: product.auction,
    createdAt: product.createdAt,
    currentHighestBidder:
      product.auction?.currentHighestBidder ||
      product.currentHighestBidder ||
      product.auction?.currentHighestBidderId?.username,
    sellerId: product.sellerId,
    // include seller info if backend provided it (aggregated)
    seller: product.seller
      ? {
          username: product.seller.username,
          rating:
            product.seller.rating ??
            (product.seller.ratingSummary?.score
              ? Number((product.seller.ratingSummary.score * 5).toFixed(1))
              : null),
          ratingSummary: product.seller.ratingSummary,
        }
      : null,
  };
};

export default function ProductsPage() {
  const location = useLocation();

  // State cho filters
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedSubcategory, setSelectedSubcategory] = useState(null); // THÊM STATE MỚI
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState([0, 100000000]);

  // ... other states ...

  // Sync URL query -> filters - CẬP NHẬT LOGIC
  useEffect(() => {
    if (!location || !location.search) {
      // Reset về mặc định khi không có query
      setSelectedCategory("All");
      setSelectedSubcategory(null);
      return;
    }

    const params = new URLSearchParams(location.search);
    const subcategoryParam = params.get("subcategory");
    const categoryParam = params.get("category") || params.get("categoryId");

    if (subcategoryParam) {
      // Nếu có subcategory, set nó trực tiếp
      const subName = decodeURIComponent(subcategoryParam);
      setSelectedSubcategory(subName);

      // Tìm parent category của subcategory này
      const parentCat = categoryMap[subName];
      if (parentCat) {
        setSelectedCategory(parentCat);
      }
    } else if (categoryParam) {
      // Nếu chỉ có category (không có subcategory)
      const catName = decodeURIComponent(categoryParam);
      setSelectedCategory(catName);
      setSelectedSubcategory(null); // Clear subcategory
    } else {
      setSelectedCategory("All");
      setSelectedSubcategory(null);
    }
  }, [location.search, categoryMap]);

  // Sử dụng filter với subcategory
  const filteredProducts = useMemo(() => {
    return filterProducts(allProducts, {
      searchQuery,
      selectedCategory,
      selectedSubcategory, // THÊM THAM SỐ MỚI
      priceRange,
      categoryMap,
    });
  }, [
    allProducts,
    searchQuery,
    selectedCategory,
    selectedSubcategory,
    priceRange,
    categoryMap,
  ]);
}

export const buildCategoryMap = (categories) => {
  const mapping = {};
  const parentCats = categories.filter((cat) => cat.level === 1);

  parentCats.forEach((parent) => {
    mapping[parent.name] = parent.name;

    if (parent.children && parent.children.length > 0) {
      parent.children.forEach((child) => {
        mapping[child.name] = parent.name;
      });
    }
  });

  return mapping;
};

export const filterProducts = (
  products,
  {
    searchQuery,
    selectedCategory,
    selectedSubcategory,
    priceRange,
    categoryMap,
  }
) => {
  let filtered = [...products];

  // 1. Lọc theo search query
  if (searchQuery) {
    filtered = filtered.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // 2. Lọc theo category/subcategory
  if (selectedSubcategory && selectedSubcategory !== "All") {
    // Ưu tiên lọc theo subcategory nếu có
    filtered = filtered.filter((p) => p.category === selectedSubcategory);
  } else if (selectedCategory && selectedCategory !== "All") {
    // Nếu không có subcategory, lọc theo parent category
    filtered = filtered.filter((p) => {
      const parentCategory = categoryMap[p.category];
      return (
        parentCategory === selectedCategory || p.category === selectedCategory
      );
    });
  }

  // 3. Lọc theo price range (kiểm tra priceRange hợp lệ)
  if (priceRange && Array.isArray(priceRange) && priceRange.length === 2) {
    const [minPrice, maxPrice] = priceRange;

    // Chỉ lọc nếu không phải giá trị mặc định (0, Infinity)
    if (minPrice > 0 || maxPrice < Infinity) {
      filtered = filtered.filter((p) => {
        const price = p.price || 0;
        return price >= minPrice && price <= maxPrice;
      });
    }
  }

  return filtered;
};

export const sortProducts = (products, sortBy) => {
  const sorted = [...products];

  switch (sortBy) {
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "bids":
      sorted.sort((a, b) => b.bids - a.bids);
      break;
    case "ending":
      sorted.sort((a, b) => {
        const aTime = a.auction?.endAt
          ? new Date(a.auction.endAt).getTime()
          : Infinity;
        const bTime = b.auction?.endAt
          ? new Date(b.auction.endAt).getTime()
          : Infinity;
        return aTime - bTime;
      });
      break;
    case "newest":
    default:
      sorted.sort((a, b) => {
        const aTime = a.auction?.createdAt
          ? new Date(a.auction.createdAt).getTime()
          : 0;
        const bTime = b.auction?.createdAt
          ? new Date(b.auction.createdAt).getTime()
          : 0;
        return bTime - aTime;
      });
      break;
  }

  return sorted;
};
