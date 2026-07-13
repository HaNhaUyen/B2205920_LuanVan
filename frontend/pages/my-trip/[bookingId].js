import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/Loading";
import { useToast } from "@/components/ToastContext";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export default function PersonalizedTrip() {
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [realItinerary, setRealItinerary] = useState([]);
  const [err, setErr] = useState("");
  const [change, setChange] = useState({ newDepartureId: "", reason: "" });
  const bookingId = router.query.bookingId;
  const load = async () => {
    const base = await apiFetch(
      `/trip-operations/user/bookings/${bookingId}/personalized-itinerary`,
    );
    setData(base);
    const operationId = base?.operation?.id || base?.tripOperationId;
    const [t, d, i] = await Promise.all([
      apiFetch(`/operations-v2/tickets/booking/${bookingId}`).catch(() => []),
      operationId
        ? apiFetch(`/operations-v2/trips/${operationId}/documents`).catch(
            () => [],
          )
        : [],
      operationId
        ? apiFetch(`/operations-v2/trips/${operationId}/itinerary`).catch(
            () => [],
          )
        : [],
    ]);
    setTickets(t || []);
    setDocuments(d || []);
    setRealItinerary(i || []);
  };
  useEffect(() => {
    if (!bookingId) return;
    load().catch((e) => setErr(e.message));
  }, [bookingId]);
  const itinerary = useMemo(
    () => (realItinerary.length ? realItinerary : data?.itinerary || []),
    [data, realItinerary],
  );
  const requestChange = async (e) => {
    e.preventDefault();
    try {
      await apiFetch("/operations-v2/departure-changes", {
        method: "POST",
        body: JSON.stringify({
          bookingId: Number(bookingId),
          newDepartureId: Number(change.newDepartureId),
          reason: change.reason,
        }),
      });
      showToast("Đã gửi yêu cầu đổi lịch", "success");
      setChange({ newDepartureId: "", reason: "" });
    } catch (e) {
      showToast(e.message, "error");
    }
  };
  if (err)
    return (
      <main className="wrap">
        <h2>{err}</h2>
      </main>
    );
  if (!data) return <Loading />;
  const b = data.booking;
  return (
    <main className="wrap">
      <section className="hero">
        <div>
          <span>CHUYẾN ĐI CỦA BẠN</span>
          <h1>{b.tourName}</h1>
          <p>{b.destinationName}</p>
        </div>
        <div className="summary">
          <b>
            {formatDate(b.departureDate)} – {formatDate(b.endDate)}
          </b>
          <small>
            Điểm đón: {b.pickupName || "Đang cập nhật"} · {b.pickupTime || ""}
          </small>
          <small>
            HDV: {b.guideName || "Đang phân công"} {b.guidePhone || ""}
          </small>
        </div>
      </section>
      <div className="grid">
        <section className="panel wide">
          <h2>Lịch trình thực tế</h2>
          {itinerary.map((x, i) => (
            <article className="item" key={x.id || i}>
              <div className="day">{x.day_number || x.dayNumber}</div>
              <div>
                <b>{x.title}</b>
                <p>{x.description}</p>
                <small>
                  {x.location_name || x.locationName} · {x.status || "planned"}
                </small>
              </div>
            </article>
          ))}
        </section>
        <section className="panel">
          <h2>Vé điện tử</h2>
          {tickets.length === 0 ? (
            <p>Vé sẽ được phát hành sau khi booking được xác nhận.</p>
          ) : (
            tickets.map((t) => (
              <div className="ticket" key={t.id}>
                <b>{t.ticket_code || t.ticketCode}</b>
                <span>{t.guestName || t.full_name || "Hành khách"}</span>
                <small>Trạng thái: {t.status}</small>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <h2>Tài liệu chuyến đi</h2>
          {documents.length === 0 ? (
            <p>Chưa có tài liệu dành cho khách.</p>
          ) : (
            documents.map((d) => (
              <a key={d.id} href={d.file_url || d.fileUrl} target="_blank">
                {d.title}
              </a>
            ))
          )}
        </section>
        <section className="panel">
          <h2>Yêu cầu đổi lịch</h2>
          <form onSubmit={requestChange}>
            <input
              type="number"
              required
              placeholder="ID lịch khởi hành mới"
              value={change.newDepartureId}
              onChange={(e) =>
                setChange({ ...change, newDepartureId: e.target.value })
              }
            />
            <textarea
              required
              placeholder="Lý do đổi lịch"
              value={change.reason}
              onChange={(e) => setChange({ ...change, reason: e.target.value })}
            />
            <button>Gửi yêu cầu</button>
          </form>
          <p className="hint">
            Admin sẽ kiểm tra số chỗ và chênh lệch giá trước khi duyệt.
          </p>
        </section>
        <section className="panel">
          <h2>Chuẩn bị trước chuyến đi</h2>
          <ul>
            {data.preparationChecklist.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        {data.journeyLogs?.length > 0 && (
          <section className="panel wide">
            <h2>Cập nhật hành trình</h2>
            {data.journeyLogs.map((x, i) => (
              <div className="item" key={i}>
                <div>
                  <b>{x.title}</b>
                  <p>{x.content}</p>
                  <small>{formatDateTime(x.occurredAt)}</small>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
      <style jsx>{`
        .wrap {
          max-width: 1100px;
          margin: 32px auto;
          padding: 0 20px;
        }
        .hero {
          background: linear-gradient(135deg, #0f766e, #0369a1);
          color: #fff;
          border-radius: 22px;
          padding: 26px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
        }
        .hero span {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }
        .summary {
          display: grid;
          gap: 7px;
          text-align: right;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 18px;
        }
        .panel {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 18px;
        }
        .wide {
          grid-column: 1/-1;
        }
        .item {
          display: flex;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid #eef2f7;
        }
        .day {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: #ccfbf1;
          color: #0f766e;
          display: grid;
          place-items: center;
          font-weight: 800;
        }
        .item p {
          color: #475569;
        }
        .item small,
        .hint {
          color: #64748b;
        }
        .ticket {
          display: grid;
          gap: 5px;
          background: #f0fdfa;
          border: 1px dashed #14b8a6;
          border-radius: 12px;
          padding: 13px;
          margin-bottom: 9px;
        }
        a {
          display: block;
          color: #0369a1;
          margin: 10px 0;
        }
        form {
          display: grid;
          gap: 9px;
        }
        input,
        textarea {
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          padding: 11px;
        }
        textarea {
          min-height: 90px;
        }
        button {
          border: 0;
          border-radius: 9px;
          background: #0f766e;
          color: #fff;
          padding: 11px;
          font-weight: 700;
        }
        li {
          margin: 9px 0;
        }
        @media (max-width: 800px) {
          .hero {
            display: grid;
          }
          .summary {
            text-align: left;
          }
          .grid {
            grid-template-columns: 1fr;
          }
          .wide {
            grid-column: auto;
          }
        }
      `}</style>
    </main>
  );
}
