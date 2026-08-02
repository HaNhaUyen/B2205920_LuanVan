from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = Path(__file__).resolve().parent / "architecture_diagrams"
OUT.mkdir(parents=True, exist_ok=True)


def box(ax, x, y, w, h, title, body=""):
    patch = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.012", linewidth=1.2, facecolor="white")
    ax.add_patch(patch)
    ax.text(x + w/2, y + h*0.65, title, ha="center", va="center", fontsize=10, fontweight="bold")
    if body:
        ax.text(x + w/2, y + h*0.30, body, ha="center", va="center", fontsize=8.2, wrap=True)
    return patch


def arrow(ax, x1, y1, x2, y2):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="->", mutation_scale=14, linewidth=1.2))


def save(fig, name):
    fig.savefig(OUT / f"{name}.png", dpi=300, bbox_inches="tight")
    fig.savefig(OUT / f"{name}.svg", bbox_inches="tight")
    plt.close(fig)


def recommendation_diagram():
    fig, ax = plt.subplots(figsize=(10, 13.5))
    ax.axis("off")
    box(ax, .25, .91, .5, .06, "DỮ LIỆU ĐẦU VÀO", "Hành vi người dùng · Nội dung tour · Lịch khởi hành")
    arrow(ax, .5, .91, .5, .86)
    box(ax, .25, .80, .5, .06, "XÂY DỰNG HỒ SƠ NGƯỜI DÙNG", "Chuẩn hóa hành vi và trích xuất nhu cầu")
    starts=[.03,.27,.51,.75]
    titles=[("Content-Based", "Đặc trưng tour"),("Collaborative", "Người dùng tương tự"),("Matrix Factorization", "Nhân tố tiềm ẩn"),("Semantic Embedding", "Khớp ngữ nghĩa")]
    for x,(t,b) in zip(starts,titles):
        arrow(ax,.5,.80,x+.10,.72)
        box(ax,x,.65,.20,.07,t,b)
        arrow(ax,x+.10,.65,.5,.57)
    box(ax,.25,.51,.5,.06,"CHUẨN HÓA VÀ TỔNG HỢP", "CoreScore = CBF + CF + MF + Semantic")
    arrow(ax,.5,.51,.5,.46)
    box(ax,.15,.37,.70,.09,"TÁI XẾP HẠNG", "BusinessScore (có tín hiệu xu hướng) · ExactIntentScore\nAgreementBonus · CommunityBonus\nDestinationPenalty · AlreadyInteractedPenalty")
    arrow(ax,.5,.37,.5,.32)
    box(ax,.25,.26,.5,.06,"LỌC ĐIỀU KIỆN NGHIỆP VỤ", "Tour công bố · Còn lịch · Còn chỗ")
    arrow(ax,.5,.26,.5,.21)
    box(ax,.25,.15,.5,.06,"ĐA DẠNG HÓA", "Giới hạn theo điểm đến và chủ đề")
    arrow(ax,.5,.15,.5,.10)
    box(ax,.25,.04,.5,.06,"TOP-K TOUR GỢI Ý", "Kết quả cá nhân hóa và lý do đề xuất")
    ax.set_xlim(0,1); ax.set_ylim(0,1)
    ax.set_title("Luồng hoạt động hệ thống gợi ý lai Travela", fontsize=16, fontweight="bold", pad=18)
    save(fig,"recommendation_hybrid_updated")


def chatbot_diagram():
    fig, ax = plt.subplots(figsize=(10, 13.5))
    ax.axis("off")
    steps=[
        ("NGƯỜI DÙNG GỬI TIN NHẮN", "Khách vãng lai · Khách hàng · Admin · Hướng dẫn viên"),
        ("XÁC THỰC VAI TRÒ VÀ HỘI THOẠI", "Tách conversation và memory theo tài khoản/scope"),
        ("RULE-FIRST NLU", "Luật nhận diện intent/entity xử lý câu rõ ràng"),
        ("INTENT GUARD / STATE MACHINE", "Giữ đúng luồng booking, hoàn tiền và hỏi tiếp"),
        ("CÔNG CỤ NGHIỆP VỤ", "Tour · Lịch · Điểm đón · Voucher · Booking · Thanh toán · Hoàn tiền"),
        ("RAG RETRIEVAL", "AI Service Sentence-Transformers + cosine similarity\nFallback: keyword + constraint boost"),
        ("GROQ", "Nhà cung cấp LLM chính"),
        ("OPENROUTER", "Nhà cung cấp dự phòng khi Groq lỗi"),
        ("KIỂM TRA ĐỘ TIN CẬY", "Không đủ dữ liệu thì hỏi làm rõ"),
        ("TRẢ PHẢN HỒI VÀ LƯU NGỮ CẢNH", "Văn bản + cards + suggested replies")
    ]
    y=.925
    for i,(t,b) in enumerate(steps):
        box(ax,.18,y,.64,.06,t,b)
        if i<len(steps)-1:
            arrow(ax,.5,y,.5,y-.045)
        y-=.09
    ax.text(.84,.337,"Nếu Groq lỗi",fontsize=8,rotation=90,va="center")
    ax.text(.84,.247,"Nếu OpenRouter lỗi:\nphản hồi nội bộ",fontsize=8,rotation=90,va="center")
    ax.set_xlim(0,1); ax.set_ylim(0,1)
    ax.set_title("Luồng hoạt động trợ lý ảo Travela", fontsize=16, fontweight="bold", pad=18)
    save(fig,"chatbot_rule_rag_updated")

if __name__ == "__main__":
    recommendation_diagram()
    chatbot_diagram()
    print(f"Đã tạo sơ đồ tại {OUT}")
