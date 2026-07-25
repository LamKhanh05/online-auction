
import React, { useState, useEffect } from "react";
import {
  Users,
  Shield,
  Loader,
  Search,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  Clock,
  Timer,
  ChevronDown,
} from "lucide-react";
import adminService from "../app/services/adminService";
import Toast from "./Toast";
import Pagination from "./Pagination";

/**
 * AdminPanel Component
 * Admin management interface with 2 main tabs:
 * - Users Management
 * - Upgrade Requests (Bidder → Seller)
 */
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("users");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all rounded-t-lg ${activeTab === "users"
              ? "bg-primary/20 text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
          >
            <Users className="w-4 h-4" />
            Danh sách tài khoản
          </button>
          <button
            onClick={() => setActiveTab("upgrades")}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all rounded-t-lg ${activeTab === "upgrades"
              ? "bg-primary/20 text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
          >
            <Shield className="w-4 h-4" />
            Yêu cầu nâng cấp
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-all rounded-t-lg ${activeTab === "settings"
              ? "bg-primary/20 text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
          >
            <Settings className="w-4 h-4" />
            Cài đặt
          </button>
        </div>

        {/* Content */}
        <div>
          {activeTab === "users" && (
            <UserManagement
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}
          {activeTab === "upgrades" && <UpgradeRequests />}
          {activeTab === "settings" && <SettingsManagement />}
        </div>
      </div>
    </div>
  );
}

// User Management Sub-component
function UserManagement({ searchQuery, setSearchQuery }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await adminService.getAllUsers(currentPage, itemsPerPage, searchQuery);

      if (response.status === 200) {
        setUsers(response.data?.data?.users || []);
        setTotalItems(response.data?.data?.pagination?.total || 0);
      } else {
        setError(response.data?.message || 'Failed to load users');
      }
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      const response = await adminService.deleteUser(userToDelete._id);

      if (response.status === 200) {
        setToast({
          type: 'success',
          message: `Đã xóa user ${userToDelete.username} thành công. ${response.data.data?.summary?.auctionsCancelled || 0} đấu giá đã hủy, ${response.data.data?.summary?.productsDeleted || 0} sản phẩm đã xóa, ${response.data.data?.summary?.emailsSent || 0} email đã gửi.`
        });

        // Refresh user list
        await fetchUsers();
        setShowDeleteModal(false);
        setUserToDelete(null);
      } else {
        setToast({
          type: 'error',
          message: response.data?.message || 'Không thể xóa user'
        });
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      setToast({
        type: 'error',
        message: err.response?.data?.message || 'Đã xảy ra lỗi khi xóa user'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentPage, searchQuery]);

  // Data is now filtered server-side
  const calculateRating = (ratingSummary) => {
    if (!ratingSummary || ratingSummary.totalCount === 0) {
      return 0;
    }
    let score = ratingSummary.score || 0;
    return (score <= 1 ? score * 100 : score).toFixed(0);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader className="w-16 h-16 text-blue-600 animate-spin mb-6" />
        <div className="text-center">
          <p className="text-lg font-bold text-foreground animate-pulse">Đang tải danh sách người dùng</p>
          <p className="text-sm text-muted-foreground mt-1">Vui lòng đợi trong giây lát...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
        <button
          onClick={fetchUsers}
          className="ml-4 text-red-600 hover:text-red-800 underline"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm người dùng..."
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          onClick={fetchUsers}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition flex items-center gap-2 font-medium shadow-lg shadow-primary/20"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* User List */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Người dùng
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Vai trò
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Đánh giá
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Trạng thái
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  className="px-6 py-8 text-center text-muted-foreground"
                >
                  {searchQuery
                    ? "Không tìm thấy người dùng nào."
                    : "Chưa có người dùng."}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user._id}
                  className="bg-white/5 border-b border-gray-800 hover:bg-white/10 cursor-pointer transition-colors"
                  onClick={(e) => {
                    // Không mở detail nếu click vào button
                    if (!e.target.closest('button')) {
                      setSelectedUser(user);
                      setShowDetailModal(true);
                    }
                  }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                        <img
                          src={user.profileImageUrl || "/placeholder-user.jpg"}
                          alt={user.username}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "/placeholder-user.jpg";
                          }}
                          className="w-full h-full rounded-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="font-semibold">{user.username}</div>
                        <div className="text-sm text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.roles?.map((role) => (
                        <span
                          key={role}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider ${role === "admin" || role === "superadmin"
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : role === "seller"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                            }`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">
                      {((user.ratingSummary?.score || 0) <= 1 ? (user.ratingSummary?.score || 0) * 100 : (user.ratingSummary?.score || 0)).toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({user.ratingSummary?.totalCount || 0})
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider ${user.status
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                    >
                      {user.status ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUserToDelete(user);
                          setShowDeleteModal(true);
                        }}
                        disabled={user.roles?.includes('superadmin')}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title={user.roles?.includes('superadmin') ? 'Không thể xóa superadmin' : 'Xóa user'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalItems > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      )}

      {/* User Detail Modal */}
      {showDetailModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-muted/50 border-b border-border p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Chi tiết người dùng</h2>
                  <p className="text-muted-foreground">Thông tin đầy đủ về tài khoản người dùng</p>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-muted rounded-lg transition text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              {/* User Profile Section */}
              <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                <div className="w-24 h-24 rounded-full p-1 bg-white/10 shadow-lg ring-2 ring-white/20 flex-shrink-0">
                  <img
                    src={selectedUser.profileImageUrl || `${import.meta.env.VITE_API_URL || "http://localhost:5001/api"}/admin/users/${selectedUser._id}/avatar?token=${localStorage.getItem('token')}`}
                    alt={selectedUser.username}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "/placeholder-user.jpg";
                    }}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <div className="flex-1 space-y-4 text-center sm:text-left w-full">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tên đăng nhập</p>
                    <h4 className="text-2xl font-bold text-foreground">{selectedUser.username}</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Họ tên</p>
                      <p className="text-foreground font-medium">{selectedUser.fullName || "Chưa cập nhật"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                      <p className="text-foreground font-medium truncate" title={selectedUser.email}>{selectedUser.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Số điện thoại</p>
                      <p className="text-foreground font-medium">{selectedUser.contactPhone || "Chưa cập nhật"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Ngày sinh</p>
                      <p className="text-foreground font-medium">{selectedUser.dateOfBirth || "Chưa cập nhật"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="bg-muted/30 rounded-xl p-4 border border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Địa chỉ</p>
                <p className="text-foreground">
                  {selectedUser.address ? [selectedUser.address.street, selectedUser.address.ward, selectedUser.address.district, selectedUser.address.city].filter(Boolean).join(', ') || "Chưa cập nhật" : "Chưa cập nhật"}
                </p>
              </div>

              {/* Roles */}
              <div className="bg-muted/30 rounded-xl p-4 border border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Vai trò</p>
                <div className="flex flex-wrap gap-2">
                  {selectedUser.roles.map(role => (
                    <span key={role} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border ${role === 'admin' || role === 'superadmin'
                      ? 'bg-red-500/10 text-red-500 border-red-500/20'
                      : role === 'seller'
                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                        : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                      }`}>
                      {role}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/30 p-4 rounded-xl border border-border">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Xếp hạng</p>
                  <p className="text-3xl font-bold text-yellow-500">
                    {calculateRating(selectedUser.ratingSummary)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ({selectedUser.ratingSummary?.totalCount || 0} đánh giá)
                  </p>
                </div>

                <div className="bg-muted/30 p-4 rounded-xl border border-border">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Trạng thái</p>
                  <p className={`text-xl font-bold capitalize ${selectedUser.status === 'active' ? 'text-green-500' : 'text-red-500'
                    }`}>
                    {selectedUser.status === 'active' ? 'Đang hoạt động' : 'Đã bị khóa'}
                  </p>
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground font-bold mb-1">Ngày tham gia</p>
                  <p className="text-foreground font-medium">{new Date(selectedUser.createdAt).toLocaleDateString("vi-VN")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-bold mb-1">Cập nhật cuối</p>
                  <p className="text-foreground font-medium">{new Date(selectedUser.updatedAt).toLocaleDateString("vi-VN")}</p>
                </div>
              </div>

              {/* User ID */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Mã người dùng</p>
                <p className="text-xs font-mono text-muted-foreground select-all break-all">{selectedUser._id}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {
        showDeleteModal && userToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-red-600 to-rose-600 p-6 text-white rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Xác nhận xóa user</h2>
                    <p className="text-red-100 text-sm">Hành động này không thể hoàn tác</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 font-semibold mb-2">Bạn có chắc chắn muốn xóa user này?</p>
                  <div className="text-sm text-red-700 space-y-1">
                    <p>• <strong>Username:</strong> {userToDelete.username}</p>
                    <p>• <strong>Email:</strong> {userToDelete.email}</p>
                    <p>• <strong>Vai trò:</strong> {userToDelete.roles?.join(', ')}</p>
                  </div>
                </div>

              </div>

              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setUserToDelete(null);
                  }}
                  disabled={isDeleting}
                  className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={isDeleting}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Đang xóa...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Xác nhận xóa
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}

// Upgrade Requests Sub-component
function UpgradeRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(null);
  const [toast, setToast] = useState(null);

  // Modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 5;
  const [openDropdown, setOpenDropdown] = useState(null);

  const fetchUpgradeRequests = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await adminService.getUpgradeRequests(currentPage, itemsPerPage);

      if (response.status === 200) {
        setRequests(response.data?.data?.requests || []);
        setTotalItems(response.data?.data?.pagination?.total || 0);
      }
    } catch (err) {
      console.error("Error fetching upgrade requests:", err);
      setError("Tải danh sách yêu cầu thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpgradeRequests();
  }, [currentPage]);

  const handleApprove = (requestId) => {
    setSelectedRequestId(requestId);
    setShowConfirmModal(true);
  };

  const confirmApprove = async () => {
    if (!selectedRequestId) return;

    try {
      setProcessing(selectedRequestId);
      setShowConfirmModal(false);
      const response = await adminService.approveUpgradeRequest(selectedRequestId);
      console.log("Approve response:", response);
      if (response.status === 200) {
        setToast({
          message:
            "Yêu cầu nâng cấp đã được chấp nhận! Người dùng đã trở thành người bán.",
          type: "success",
        });
        // Refresh the list
        fetchUpgradeRequests();

        // Trigger refresh of users tab if needed
        window.dispatchEvent(new CustomEvent("refreshUsers"));
      } else {
        setToast({
          message: (response.message || "Chấp nhận yêu cầu thất bại"),
          type: "error",
        });
      }
    } catch (err) {
      console.error("Error approving request:", err);
      setToast({
        message: "Đã xảy ra lỗi khi chấp nhận yêu cầu",
        type: "error",
      });
    } finally {
      setProcessing(null);
      setSelectedRequestId(null);
    }
  };

  const handleReject = (requestId) => {
    setSelectedRequestId(requestId);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!selectedRequestId || !rejectReason.trim()) {
      setToast({
        message: "Vui lòng nhập lý do từ chối",
        type: "error",
      });
      return;
    }

    try {
      setProcessing(selectedRequestId);
      setShowRejectModal(false);
      const response = await adminService.rejectUpgradeRequest(selectedRequestId, {
        reason: rejectReason,
      });

      if (response.status === 200) {
        setToast({
          message: "Yêu cầu nâng cấp đã bị từ chối.",
          type: "success",
        });
        // Refresh the list
        fetchUpgradeRequests();
      } else {
        setToast({
          message: (response.message || "Từ chối yêu cầu thất bại"),
          type: "error",
        });
      }
    } catch (err) {
      console.error("Error rejecting request:", err);
      setToast({
        message: "Đã xảy ra lỗi khi từ chối yêu cầu",
        type: "error",
      });
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader className="w-16 h-16 text-blue-600 animate-spin mb-6" />
        <div className="text-center">
          <p className="text-lg font-bold text-foreground animate-pulse">Đang tải danh sách yêu cầu</p>
          <p className="text-sm text-muted-foreground mt-1">Đang xử lý thông tin...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
        <button
          onClick={fetchUpgradeRequests}
          className="ml-4 text-red-600 hover:text-red-800 underline"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">
            Yêu cầu nâng cấp đang chờ xử lý
          </h2>
          <p className="text-sm text-muted-foreground">
            Người đấu giá yêu cầu trở thành người bán
          </p>
        </div>
        <button
          onClick={fetchUpgradeRequests}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition flex items-center gap-2 font-medium shadow-lg shadow-primary/20"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Người dùng
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Ngày yêu cầu
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Đánh giá
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Tổng số đánh giá
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                Trạng thái
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {requests.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  className="px-6 py-8 text-center text-muted-foreground"
                >
                  Không có yêu cầu nâng cấp nào đang chờ xử lý.
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr
                  key={request._id}
                  className="bg-white/5 border-b border-gray-800 hover:bg-white/10 cursor-pointer transition"
                  onClick={(e) => {
                    // Không mở detail nếu click vào button
                    if (!e.target.closest('button')) {
                      setSelectedRequest(request);
                      setShowDetailModal(true);
                    }
                  }}
                >
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-semibold">
                        {request.user?.username || request.userId?.username}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {request.user?.email || request.userId?.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {new Date(request.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold">
                      {((request.user?.ratingSummary?.score || 0) <= 1 ? (request.user?.ratingSummary?.score || 0) * 100 : (request.user?.ratingSummary?.score || 0)).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">{request.user?.ratingSummary?.totalCount || 0}</td>
                  <td className="px-6 py-4">
                    <div className="relative">
                      {request.status === "pending" ? (
                        <div>
                          <button
                            onClick={() => setOpenDropdown(openDropdown === request._id ? null : request._id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20 transition flex items-center gap-1"
                          >
                            Đang chờ
                            <ChevronDown className={`w-3 h-3 transition-transform ${openDropdown === request._id ? 'rotate-180' : ''}`} />
                          </button>

                          {openDropdown === request._id && (
                            <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-gray-700 rounded-lg shadow-xl z-10 min-w-[160px]">
                              <button
                                onClick={() => {
                                  setOpenDropdown(null);
                                  handleApprove(request._id);
                                }}
                                disabled={processing === request._id}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-400 hover:bg-green-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <CheckCircle className="w-4 h-4" />
                                {processing === request._id ? "Đang xử lý..." : "Chấp nhận"}
                              </button>
                              <button
                                onClick={() => {
                                  setOpenDropdown(null);
                                  handleReject(request._id);
                                }}
                                disabled={processing === request._id}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50 disabled:cursor-not-allowed border-t border-gray-700"
                              >
                                <XCircle className="w-4 h-4" />
                                Từ chối
                              </button>
                            </div>
                          )}
                        </div>
                      ) : request.status === "approved" ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider bg-green-500/10 text-green-400 border-green-500/20">
                            Đã chấp nhận
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider bg-red-500/10 text-red-400 border-red-500/20">
                            Đã từ chối
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <div className="text-sm text-muted-foreground">
          {requests.filter((r) => r.status === "pending").length} yêu cầu đang chờ xử lý trên trang này
        </div>
        {totalItems > itemsPerPage && (
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailModal(false)}>
          <div className="bg-background border border-border rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-muted/50 border-b border-border p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Chi tiết yêu cầu nâng cấp</h2>
                  <p className="text-muted-foreground">Thông tin đầy đủ về yêu cầu nâng cấp tài khoản</p>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-muted rounded-lg transition text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              {/* User Info Section */}
              <div className="bg-muted/30 rounded-xl p-6 border border-border">
                <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  Thông tin người dùng
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tên đăng nhập</p>
                    <p className="font-semibold text-foreground">
                      {selectedRequest.user?.username || selectedRequest.userId?.username || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Họ và tên</p>
                    <p className="font-semibold text-foreground">
                      {selectedRequest.user?.fullName || selectedRequest.userId?.fullName || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                    <p className="font-semibold text-foreground">
                      {selectedRequest.user?.email || selectedRequest.userId?.email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Số điện thoại</p>
                    <p className="font-semibold text-foreground">
                      {selectedRequest.user?.phone || selectedRequest.userId?.phone || 'Chưa cập nhật'}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Địa chỉ</p>
                    <p className="font-semibold text-foreground">
                      {(() => {
                        const address = selectedRequest.user?.address || selectedRequest.userId?.address;
                        if (!address) return 'Chưa cập nhật';
                        if (typeof address === 'string') return address;
                        const parts = [
                          address.street,
                          address.ward,
                          address.district,
                          address.city
                        ].filter(Boolean);
                        return parts.length > 0 ? parts.join(', ') : 'Chưa cập nhật';
                      })()}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Vai trò hiện tại</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedRequest.user?.roles || selectedRequest.userId?.roles || []).map((role) => (
                        <span
                          key={role}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border ${role === "admin" || role === "superadmin"
                            ? "bg-red-500/10 text-red-500 border-red-500/20"
                            : role === "seller"
                              ? "bg-green-500/10 text-green-500 border-green-500/20"
                              : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                            }`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rating Section */}
              <div className="bg-muted/30 rounded-xl p-6 border border-border">
                <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-yellow-500" />
                  Đánh giá và hoạt động
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Điểm đánh giá</p>
                    <p className="text-2xl font-bold text-yellow-500">
                      {Math.round((selectedRequest.user?.ratingSummary?.score || 0))}%
                    </p>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tích cực</p>
                    <p className="text-2xl font-bold text-green-500">
                      {selectedRequest.user?.ratingSummary?.countPositive || 0}
                    </p>
                  </div>
                  <div className="bg-background p-4 rounded-lg border border-border">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Tiêu cực</p>
                    <p className="text-2xl font-bold text-red-500">
                      {selectedRequest.user?.ratingSummary?.countNegative || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Request Info Section */}
              <div className="bg-muted/30 rounded-xl p-6 border border-border">
                <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-purple-500" />
                  Thông tin yêu cầu
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Ngày yêu cầu</p>
                    <p className="font-semibold text-foreground">
                      {new Date(selectedRequest.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Trạng thái</p>
                    <span
                      className={`inline-block px-3 py-1.5 rounded-lg text-xs font-bold border ${selectedRequest.status === "pending"
                        ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                        : selectedRequest.status === "approved"
                          ? "bg-green-500/10 text-green-500 border-green-500/20"
                          : "bg-red-500/10 text-red-500 border-red-500/20"
                        }`}
                    >
                      {selectedRequest.status === "pending"
                        ? "Đang chờ xử lý"
                        : selectedRequest.status === "approved"
                          ? "Đã chấp nhận"
                          : "Đã từ chối"}
                    </span>
                  </div>
                  {selectedRequest.reviewedAt && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Ngày xử lý</p>
                      <p className="font-semibold text-foreground">
                        {new Date(selectedRequest.reviewedAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  )}
                  {selectedRequest.reviewedBy && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Người xử lý</p>
                      <p className="font-semibold text-foreground">
                        {selectedRequest.reviewedBy.fullName || selectedRequest.reviewedBy.username || 'Admin'}
                      </p>
                    </div>
                  )}
                </div>
                {(() => {
                  const note = selectedRequest.reviewNote;
                  if (!note || note === '' || note === '[object Object]') return null;

                  return (
                    <div className="mt-4">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Ghi chú xử lý</p>
                      <div className="bg-background border border-border rounded-lg p-4">
                        <p className="text-foreground text-sm">
                          {typeof note === 'string' ? note : JSON.stringify(note)}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer with Actions */}
            <div className="bg-muted/50 px-8 py-4 border-t border-border flex justify-end gap-3">
              {selectedRequest.status === "pending" && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDetailModal(false);
                      handleReject(selectedRequest._id);
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium shadow-lg shadow-red-600/20"
                  >
                    <XCircle className="w-5 h-5" />
                    Từ chối
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDetailModal(false);
                      handleApprove(selectedRequest._id);
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium shadow-lg shadow-green-600/20"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Chấp nhận
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Approve Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Chấp nhận yêu cầu</h3>
                <p className="text-sm text-gray-400">Xác nhận nâng cấp tài khoản</p>
              </div>
            </div>

            <p className="text-gray-300 mb-6">
              Bạn có chắc chắn muốn chấp nhận yêu cầu nâng cấp này không? Người dùng sẽ trở thành người bán trong 7 ngày.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedRequestId(null);
                }}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition font-medium"
              >
                Hủy
              </button>
              <button
                onClick={confirmApprove}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium"
              >
                Xác nhận chấp nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Từ chối yêu cầu</h3>
                <p className="text-sm text-gray-400">Cung cấp lý do từ chối</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Lý do từ chối <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do từ chối (tối thiểu 10 ký tự)..."
                className="w-full px-3 py-2 bg-slate-950 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none placeholder:text-gray-600"
                rows="4"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                {rejectReason.length}/100 ký tự
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRequestId(null);
                  setRejectReason("");
                }}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition font-medium"
              >
                Hủy
              </button>
              <button
                onClick={confirmReject}
                disabled={rejectReason.trim().length < 10}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// Settings Management Sub-component
function SettingsManagement() {
  const [settings, setSettings] = useState({
    autoExtendThreshold: 5,
    autoExtendDuration: 10
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await adminService.getAutoExtendSettings();
      if (response.data.success) {
        const data = response.data.data;
        setSettings(data);
        setOriginalSettings(data);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      setToast({
        type: "error",
        message: "Không thể tải cài đặt"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    // Chỉ cho phép nhập số
    const numValue = value === '' ? '' : parseInt(value);

    // Validate giới hạn
    let validatedValue = numValue;
    if (field === 'autoExtendThreshold') {
      if (numValue !== '' && (numValue < 1 || numValue > 60)) {
        return; // Không cho nhập giá trị ngoài giới hạn
      }
    } else if (field === 'autoExtendDuration') {
      if (numValue !== '' && (numValue < 1 || numValue > 120)) {
        return;
      }
    }

    const newSettings = { ...settings, [field]: validatedValue };
    setSettings(newSettings);

    // Check if there are changes
    const changed = JSON.stringify(newSettings) !== JSON.stringify(originalSettings);
    setHasChanges(changed);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await adminService.updateAutoExtendSettings(settings);
      if (response.data.success) {
        setToast({
          type: "success",
          message: "Đã lưu cài đặt thành công"
        });
        setOriginalSettings(settings);
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setToast({
        type: "error",
        message: error.response?.data?.message || "Không thể lưu cài đặt"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(originalSettings);
    setHasChanges(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">Đang tải cài đặt...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-xl px-6 py-4 border-b border-white/5">
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">Cài đặt tham số tự động gia hạn</h2>
      </div>

      {/* Settings Card */}
      <div className="glass rounded-xl border border-white/5 shadow-sm">
        <div className="p-6 space-y-6">

          {/* Threshold Setting */}
          <div className="space-y-3 bg-white/5 p-4 rounded-lg border border-white/10">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <label className="font-semibold text-gray-100">
                Ngưỡng thời gian kích hoạt
              </label>
            </div>
            <div className="ml-7 flex items-center gap-4">
              <div className="flex items-center bg-white/5 border border-white/10 rounded-lg focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={settings.autoExtendThreshold}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    handleChange('autoExtendThreshold', value);
                  }}
                  onBlur={(e) => {
                    // Nếu để trống, set về giá trị mặc định
                    if (e.target.value === '') {
                      handleChange('autoExtendThreshold', 5);
                    }
                  }}
                  placeholder="5"
                  className="w-24 pl-4 pr-2 py-2.5 bg-transparent text-white placeholder-gray-500 font-mono outline-none text-right"
                />
                <span className="pr-4 text-gray-400 font-medium select-none border-l border-white/5 pl-2 ml-1">phút</span>
              </div>
              <span className="text-sm text-gray-500 italic">
                (Mặc định: 5 phút, giới hạn: 1-60)
              </span>
            </div>
          </div>

          {/* Duration Setting */}
          <div className="space-y-3 bg-white/5 p-4 rounded-lg border border-white/10">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-blue-400" />
              <label className="font-semibold text-gray-100">
                Thời gian gia hạn
              </label>
            </div>
            <div className="ml-7 flex items-center gap-4">
              <div className="flex items-center bg-white/5 border border-white/10 rounded-lg focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={settings.autoExtendDuration}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    handleChange('autoExtendDuration', value);
                  }}
                  onBlur={(e) => {
                    // Nếu để trống, set về giá trị mặc định
                    if (e.target.value === '') {
                      handleChange('autoExtendDuration', 10);
                    }
                  }}
                  placeholder="10"
                  className="w-24 pl-4 pr-2 py-2.5 bg-transparent text-white placeholder-gray-500 font-mono outline-none text-right"
                />
                <span className="pr-4 text-gray-400 font-medium select-none border-l border-white/5 pl-2 ml-1">phút</span>
              </div>
              <span className="text-sm text-gray-500 italic">
                (Mặc định: 10 phút, giới hạn: 1-120)
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white/5 px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={handleReset}
            disabled={!hasChanges || saving}
            className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed text-gray-200"
          >
            Hủy thay đổi
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Đang lưu...
              </>
            ) : (
              'Lưu cài đặt'
            )}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
