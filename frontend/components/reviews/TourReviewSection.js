import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { mapImageUrl } from "@/lib/tour";
import { useToast } from "@/components/ToastContext";

const PREVIEW_REVIEW_LIMIT = 2;
const MODAL_REVIEW_LIMIT = 8;

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN");
}

function Stars({ value = 5, size = 18 }) {
  const rating = Number(value || 0);

  return (
    <span style={{ color: "#f59e0b", fontSize: size, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((star) => (star <= rating ? "★" : "☆")).join("")}
    </span>
  );
}

function ReviewImages({ media = [], onPreview }) {
  if (!Array.isArray(media) || !media.length) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 10,
      }}
    >
      {media.map((item) => {
        const url = mapImageUrl(item.fileUrl, API_URL);

        return (
          <button
            type="button"
            key={item.id || item.fileUrl}
            onClick={() => onPreview?.(url)}
            style={{
              width: 78,
              height: 78,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              padding: 0,
              overflow: "hidden",
              background: "#f8fafc",
              cursor: "pointer",
            }}
          >
            <img
              src={url}
              alt="Ảnh đánh giá"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function ReviewItem({ item, onPreview }) {
  return (
    <article
      style={{
        padding: "18px 0",
        borderBottom: "1px solid #f1f5f9",
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          overflow: "hidden",
          background: "#e2e8f0",
          display: "grid",
          placeItems: "center",
          color: "#64748b",
          fontWeight: 900,
        }}
      >
        {item.user?.avatarUrl ? (
          <img
            src={mapImageUrl(item.user.avatarUrl, API_URL)}
            alt={item.user?.fullName || "User"}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          String(item.user?.fullName || "K")
            .charAt(0)
            .toUpperCase()
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <strong style={{ color: "#0f172a" }}>
            {item.user?.fullName || "Khách hàng"}
          </strong>
          <span style={{ color: "#94a3b8", fontSize: 13 }}>
            {formatDate(item.createdAt)}
          </span>
        </div>

        <div style={{ marginTop: 4 }}>
          <Stars value={item.rating} size={15} />
        </div>

        {item.comment ? (
          <p
            style={{
              margin: "10px 0 0",
              color: "#334155",
              lineHeight: 1.65,
              whiteSpace: "pre-line",
            }}
          >
            {item.comment}
          </p>
        ) : null}

        <ReviewImages media={item.media} onPreview={onPreview} />

        {item.adminReply ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              color: "#475569",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#0f172a" }}>Phản hồi từ Travela:</strong>{" "}
            {item.adminReply}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function TourReviewSection({
  tour,
  currentUser,
  onRequireLogin,
}) {
  const { showToast } = useToast();

  const [summary, setSummary] = useState({
    averageRating: 0,
    total: 0,
    starCounts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    mediaCount: 0,
  });

  const [previewReviews, setPreviewReviews] = useState([]);
  const [previewPagination, setPreviewPagination] = useState({
    page: 1,
    pageSize: PREVIEW_REVIEW_LIMIT,
    total: 0,
    totalPages: 1,
  });

  const [modalReviews, setModalReviews] = useState([]);
  const [modalPagination, setModalPagination] = useState({
    page: 1,
    pageSize: MODAL_REVIEW_LIMIT,
    total: 0,
    totalPages: 1,
  });

  const [ratingFilter, setRatingFilter] = useState("");
  const [hasMediaFilter, setHasMediaFilter] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");

  const [eligibleBookings, setEligibleBookings] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState("");

  const [form, setForm] = useState({
    rating: 5,
    comment: "",
  });
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingModal, setLoadingModal] = useState(false);

  const canReview = useMemo(
    () => Boolean(currentUser && selectedBookingId),
    [currentUser, selectedBookingId],
  );

  const totalReviews = Number(summary.total || previewPagination.total || 0);
  const shouldShowMoreButton = totalReviews > PREVIEW_REVIEW_LIMIT;

  const fetchReviews = async ({
    page = 1,
    pageSize = PREVIEW_REVIEW_LIMIT,
    rating = ratingFilter,
    hasMedia = hasMediaFilter,
  } = {}) => {
    if (!tour?.id) {
      return {
        summary,
        items: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
        },
      };
    }

    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    if (rating) qs.set("rating", String(rating));
    if (hasMedia) qs.set("hasMedia", "true");

    return apiFetch(`/reviews/tour/${tour.id}?${qs.toString()}`);
  };

  const loadPreviewReviews = async ({
    rating = ratingFilter,
    hasMedia = hasMediaFilter,
  } = {}) => {
    if (!tour?.id) return;

    setLoadingPreview(true);

    try {
      const data = await fetchReviews({
        page: 1,
        pageSize: PREVIEW_REVIEW_LIMIT,
        rating,
        hasMedia,
      });

      setSummary(
        data?.summary || {
          averageRating: 0,
          total: 0,
          starCounts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          mediaCount: 0,
        },
      );

      setPreviewReviews(data?.items || []);
      setPreviewPagination(
        data?.pagination || {
          page: 1,
          pageSize: PREVIEW_REVIEW_LIMIT,
          total: 0,
          totalPages: 1,
        },
      );
    } catch (error) {
      showToast(error.message || "Không tải được đánh giá.", "error");
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadModalReviews = async ({
    page = 1,
    append = false,
    rating = ratingFilter,
    hasMedia = hasMediaFilter,
  } = {}) => {
    if (!tour?.id) return;

    setLoadingModal(true);

    try {
      const data = await fetchReviews({
        page,
        pageSize: MODAL_REVIEW_LIMIT,
        rating,
        hasMedia,
      });

      setSummary(
        data?.summary || {
          averageRating: 0,
          total: 0,
          starCounts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          mediaCount: 0,
        },
      );

      setModalReviews((prev) =>
        append ? [...prev, ...(data?.items || [])] : data?.items || [],
      );

      setModalPagination(
        data?.pagination || {
          page,
          pageSize: MODAL_REVIEW_LIMIT,
          total: 0,
          totalPages: 1,
        },
      );
    } catch (error) {
      showToast(error.message || "Không tải được đánh giá.", "error");
    } finally {
      setLoadingModal(false);
    }
  };

  const loadEligibleBookings = async () => {
    if (!tour?.id || !currentUser) {
      setEligibleBookings([]);
      setSelectedBookingId("");
      return;
    }

    try {
      const items = await apiFetch(
        `/reviews/tour/${tour.id}/eligible-bookings`,
      );
      const rows = Array.isArray(items) ? items : [];
      const notReviewed = rows.filter((item) => !item.reviewed);

      setEligibleBookings(notReviewed);
      setSelectedBookingId(notReviewed[0]?.id || "");
    } catch (error) {
      setEligibleBookings([]);
      setSelectedBookingId("");
    }
  };

  useEffect(() => {
    setRatingFilter("");
    setHasMediaFilter(false);
    setModalOpen(false);
    setModalReviews([]);
    loadPreviewReviews({
      rating: "",
      hasMedia: false,
    });
  }, [tour?.id]);

  useEffect(() => {
    loadEligibleBookings();
  }, [tour?.id, currentUser?.id]);

  const changeFilter = async (nextRating, nextHasMedia = false) => {
    setRatingFilter(nextRating);
    setHasMediaFilter(nextHasMedia);
    setModalReviews([]);
    setModalPagination({
      page: 1,
      pageSize: MODAL_REVIEW_LIMIT,
      total: 0,
      totalPages: 1,
    });

    await loadPreviewReviews({
      rating: nextRating,
      hasMedia: nextHasMedia,
    });

    if (modalOpen) {
      await loadModalReviews({
        page: 1,
        append: false,
        rating: nextRating,
        hasMedia: nextHasMedia,
      });
    }
  };

  const openReviewModal = async () => {
    setModalOpen(true);
    setModalReviews([]);
    await loadModalReviews({
      page: 1,
      append: false,
      rating: ratingFilter,
      hasMedia: hasMediaFilter,
    });
  };

  const handleImageChange = (event) => {
    const files = Array.from(event.target.files || []);

    if (files.length > 5) {
      showToast("Mỗi đánh giá chỉ được tải tối đa 5 ảnh.", "error");
      return;
    }

    for (const file of files) {
      if (!file.type?.startsWith("image/")) {
        showToast(`"${file.name}" không phải file ảnh.`, "error");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast(`"${file.name}" vượt quá 5MB.`, "error");
        return;
      }
    }

    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setSelectedImages(files);
    setImagePreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const clearSelectedImages = () => {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setSelectedImages([]);
    setImagePreviews([]);
  };

  const submitReview = async (event) => {
    event.preventDefault();

    if (!currentUser) {
      onRequireLogin?.();
      return;
    }

    if (!selectedBookingId) {
      showToast(
        "Bạn cần đặt tour, thanh toán thành công và hoàn thành chuyến đi trước khi gửi đánh giá.",
        "error",
      );
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("tourId", String(tour.id));
      formData.append("bookingId", String(selectedBookingId));
      formData.append("rating", String(form.rating));
      formData.append("comment", form.comment || "");

      selectedImages.forEach((file) => {
        formData.append("images", file);
      });

      await apiFetch("/reviews", {
        method: "POST",
        body: formData,
      });

      showToast("Đã gửi đánh giá.", "success");

      setForm({ rating: 5, comment: "" });
      clearSelectedImages();

      await Promise.all([
        loadPreviewReviews({
          rating: ratingFilter,
          hasMedia: hasMediaFilter,
        }),
        modalOpen
          ? loadModalReviews({
              page: 1,
              append: false,
              rating: ratingFilter,
              hasMedia: hasMediaFilter,
            })
          : Promise.resolve(),
        loadEligibleBookings(),
      ]);
    } catch (error) {
      showToast(error.message || "Không gửi được đánh giá.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const filterChips = [
    {
      label: `Tất cả ${summary.total || 0}`,
      rating: "",
      hasMedia: false,
    },
    {
      label: `5 sao ${
        summary.starCounts?.["5"] || summary.starCounts?.[5] || 0
      }`,
      rating: 5,
      hasMedia: false,
    },
    {
      label: `4 sao ${
        summary.starCounts?.["4"] || summary.starCounts?.[4] || 0
      }`,
      rating: 4,
      hasMedia: false,
    },
    {
      label: `3 sao ${
        summary.starCounts?.["3"] || summary.starCounts?.[3] || 0
      }`,
      rating: 3,
      hasMedia: false,
    },
    {
      label: `2 sao ${
        summary.starCounts?.["2"] || summary.starCounts?.[2] || 0
      }`,
      rating: 2,
      hasMedia: false,
    },
    {
      label: `1 sao ${
        summary.starCounts?.["1"] || summary.starCounts?.[1] || 0
      }`,
      rating: 1,
      hasMedia: false,
    },
    {
      label: `Có hình ảnh ${summary.mediaCount || 0}`,
      rating: "",
      hasMedia: true,
    },
  ];

  const FilterChips = (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginTop: 18,
      }}
    >
      {filterChips.map((chip) => {
        const active =
          String(ratingFilter || "") === String(chip.rating || "") &&
          Boolean(hasMediaFilter) === Boolean(chip.hasMedia);

        return (
          <button
            type="button"
            key={`${chip.label}-${chip.rating}-${chip.hasMedia}`}
            onClick={() => changeFilter(chip.rating, chip.hasMedia)}
            style={{
              border: active ? "1px solid #f97316" : "1px solid #e2e8f0",
              background: active ? "#fff7ed" : "#fff",
              color: active ? "#ea580c" : "#334155",
              borderRadius: 999,
              padding: "9px 13px",
              cursor: "pointer",
              fontWeight: active ? 800 : 600,
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );

  const PreviewList = (
    <div style={{ marginTop: 18 }}>
      {loadingPreview && !previewReviews.length ? (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            background: "#f8fafc",
            color: "#64748b",
            textAlign: "center",
            border: "1px dashed #cbd5e1",
          }}
        >
          Đang tải đánh giá...
        </div>
      ) : previewReviews.length ? (
        previewReviews.map((item) => (
          <ReviewItem
            key={item.id}
            item={item}
            onPreview={(url) => setPreviewImage(url)}
          />
        ))
      ) : (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            background: "#f8fafc",
            color: "#64748b",
            textAlign: "center",
            border: "1px dashed #cbd5e1",
          }}
        >
          Chưa có đánh giá phù hợp.
        </div>
      )}
    </div>
  );

  const ModalList = (
    <>
      <div style={{ marginTop: 18 }}>
        {loadingModal && !modalReviews.length ? (
          <div
            style={{
              padding: 24,
              borderRadius: 16,
              background: "#f8fafc",
              color: "#64748b",
              textAlign: "center",
              border: "1px dashed #cbd5e1",
            }}
          >
            Đang tải đánh giá...
          </div>
        ) : modalReviews.length ? (
          modalReviews.map((item) => (
            <ReviewItem
              key={item.id}
              item={item}
              onPreview={(url) => setPreviewImage(url)}
            />
          ))
        ) : (
          <div
            style={{
              padding: 24,
              borderRadius: 16,
              background: "#f8fafc",
              color: "#64748b",
              textAlign: "center",
              border: "1px dashed #cbd5e1",
            }}
          >
            Chưa có đánh giá phù hợp.
          </div>
        )}
      </div>

      {modalPagination.page < modalPagination.totalPages ? (
        <button
          type="button"
          disabled={loadingModal}
          onClick={() =>
            loadModalReviews({
              page: modalPagination.page + 1,
              append: true,
              rating: ratingFilter,
              hasMedia: hasMediaFilter,
            })
          }
          style={{
            marginTop: 18,
            width: "100%",
            border: "1px solid #f97316",
            background: "#fff7ed",
            color: "#ea580c",
            borderRadius: 14,
            padding: "12px 16px",
            fontWeight: 900,
            cursor: loadingModal ? "wait" : "pointer",
          }}
        >
          {loadingModal ? "Đang tải..." : "Tải thêm đánh giá"}
        </button>
      ) : null}
    </>
  );

  return (
    <section
      style={{
        background: "#fff",
        padding: 32,
        borderRadius: 24,
        border: "1px solid #f1f5f9",
        boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: "#0f172a",
              fontSize: "1.8rem",
            }}
          >
            Đánh giá từ khách hàng
          </h2>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>
            Chỉ khách đã hoàn thành chuyến đi mới có thể gửi đánh giá.
          </p>
        </div>

        <div
          style={{
            minWidth: 180,
            padding: 18,
            borderRadius: 18,
            background: "#fff7ed",
            textAlign: "center",
            border: "1px solid #fed7aa",
          }}
        >
          <strong
            style={{
              display: "block",
              color: "#ea580c",
              fontSize: 34,
              lineHeight: 1,
            }}
          >
            {summary.averageRating || 0}/5
          </strong>
          <div style={{ marginTop: 6 }}>
            <Stars value={Math.round(summary.averageRating || 0)} />
          </div>
          <span style={{ color: "#9a3412", fontSize: 13 }}>
            {summary.total || 0} đánh giá
          </span>
        </div>
      </div>

      <form
        onSubmit={submitReview}
        style={{
          marginTop: 24,
          padding: 18,
          borderRadius: 18,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          display: "grid",
          gap: 14,
        }}
      >
        <strong style={{ color: "#0f172a" }}>Gửi đánh giá của bạn</strong>

        {currentUser ? (
          eligibleBookings.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              <label
                style={{
                  color: "#334155",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                Chọn chuyến đi muốn đánh giá
              </label>

              <select
                value={selectedBookingId}
                onChange={(event) => setSelectedBookingId(event.target.value)}
                style={{
                  width: "100%",
                  border: "1px solid #cbd5e1",
                  borderRadius: 14,
                  padding: "12px 14px",
                  outline: "none",
                  background: "#fff",
                  color: "#0f172a",
                }}
              >
                {eligibleBookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.bookingCode} · {booking.tourName || tour.name} ·
                    Kết thúc{" "}
                    {booking.endDate ? formatDate(booking.endDate) : "chưa rõ"}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                color: "#9a3412",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              Bạn cần đặt tour, thanh toán thành công và hoàn thành chuyến đi
              trước khi gửi đánh giá.
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={onRequireLogin}
            style={{
              border: "none",
              background: "#0f172a",
              color: "#fff",
              borderRadius: 14,
              padding: "12px 16px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Đăng nhập để đánh giá
          </button>
        )}

        <div>
          <label
            style={{
              display: "block",
              color: "#334155",
              fontWeight: 800,
              fontSize: 13,
              marginBottom: 8,
            }}
          >
            Số sao
          </label>
          <select
            value={form.rating}
            disabled={!canReview}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                rating: Number(event.target.value),
              }))
            }
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: 14,
              padding: "12px 14px",
              background: "#fff",
              color: "#0f172a",
              width: "100%",
            }}
          >
            {[5, 4, 3, 2, 1].map((star) => (
              <option key={star} value={star}>
                {star} sao
              </option>
            ))}
          </select>
        </div>

        <textarea
          value={form.comment}
          disabled={!canReview}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              comment: event.target.value,
            }))
          }
          rows={4}
          placeholder="Chia sẻ trải nghiệm thực tế của bạn về tour..."
          style={{
            width: "100%",
            border: "1px solid #cbd5e1",
            borderRadius: 14,
            padding: "12px 14px",
            resize: "vertical",
            outline: "none",
            background: "#fff",
            color: "#0f172a",
          }}
        />

        <div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "1px dashed #cbd5e1",
              background: "#fff",
              color: "#334155",
              borderRadius: 14,
              padding: "12px 16px",
              cursor: canReview ? "pointer" : "not-allowed",
              fontWeight: 800,
            }}
          >
            Tải ảnh trải nghiệm
            <input
              hidden
              type="file"
              accept="image/*"
              multiple
              disabled={!canReview}
              onChange={handleImageChange}
            />
          </label>

          {imagePreviews.length ? (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              {imagePreviews.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt="Preview"
                  style={{
                    width: 78,
                    height: 78,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                  }}
                />
              ))}
              <button
                type="button"
                onClick={clearSelectedImages}
                style={{
                  border: "none",
                  background: "#fee2e2",
                  color: "#b91c1c",
                  borderRadius: 10,
                  padding: "0 12px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Xóa ảnh
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!canReview || submitting}
          style={{
            border: "none",
            background:
              canReview && !submitting
                ? "linear-gradient(135deg, #f97316, #fb923c)"
                : "#cbd5e1",
            color: "#fff",
            borderRadius: 14,
            padding: "13px 16px",
            fontWeight: 900,
            cursor: canReview && !submitting ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Đang gửi..." : "Gửi đánh giá"}
        </button>
      </form>

      {FilterChips}
      {PreviewList}

      {shouldShowMoreButton ? (
        <button
          type="button"
          onClick={openReviewModal}
          style={{
            marginTop: 20,
            width: "100%",
            border: "1px solid #fb923c",
            background: "#fff7ed",
            color: "#ea580c",
            borderRadius: 14,
            padding: "13px 16px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Xem thêm đánh giá
        </button>
      ) : null}

      {modalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(15,23,42,0.52)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              width: "min(920px, 100%)",
              maxHeight: "88vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 22,
              padding: 24,
              boxShadow: "0 30px 90px rgba(15,23,42,0.28)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#0f172a", fontSize: 24 }}>
                  Tất cả đánh giá
                </h3>
                <p style={{ margin: "5px 0 0", color: "#64748b" }}>
                  {summary.averageRating || 0}/5 · {summary.total || 0} đánh giá
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "none",
                  background: "#0f172a",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 22,
                  fontWeight: 900,
                }}
              >
                ×
              </button>
            </div>

            {FilterChips}
            {ModalList}
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: "rgba(15,23,42,0.82)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => setPreviewImage("")}
        >
          <img
            src={previewImage}
            alt="Ảnh đánh giá"
            style={{
              maxWidth: "94vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 16,
              background: "#fff",
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
