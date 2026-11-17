# Frontend

Frontend React/Vite cho API tài liệu và máy chủ WebSocket FastAPI.

## Chạy ứng dụng

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

## Chạy backend

Từ thư mục `LTM`, cài đặt dependencies:

```powershell
pip install -r backend/requirements.txt
```

Chạy API và WebSocket trong hai terminal riêng:

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```powershell
python -m uvicorn websocket.ws_main:app --host 127.0.0.1 --port 1234
```

Frontend mặc định gọi API tại `http://127.0.0.1:8000` và WebSocket tại
`ws://127.0.0.1:1234`. Có thể đổi các địa chỉ này trong `.env`.

## Cấu trúc mã nguồn

- `src/App.jsx`: quản lý trạng thái ứng dụng và điều phối các màn hình.
- `src/api/client.js`: cấu hình URL và gửi yêu cầu API.
- `src/components/`: màn hình đăng nhập, danh sách tài liệu, sidebar và trình soạn thảo cộng tác.
- `src/utils/`: tiện ích tài liệu, bộ đếm từ và tùy chọn định dạng.
- `src/main.jsx` và `src/styles.css`: điểm khởi chạy React và kiểu giao diện.

## Soạn thảo và đồng bộ

Editor dùng Yjs/Tiptap để đồng bộ nội dung rich text, định dạng chữ và vị trí
con trỏ cộng tác. Quyền xem/chỉnh sửa được kiểm tra trên cả API lẫn WebSocket;
tài liệu chỉ xem không bật con trỏ soạn thảo hay gửi thay đổi nội dung.
Định dạng đang chọn được giữ trong phiên làm việc, kể cả khi xóa nội dung hoặc
chuyển tài liệu. Có thể đổi tên tài liệu từ tiêu đề ở thanh trên cùng.

Thanh công cụ hỗ trợ định dạng chữ, căn lề, danh sách đầu dòng và đánh số,
giãn dòng và chèn ảnh. Khu vực soạn thảo dùng khổ A4
(210 × 297 mm) với lề 25,4 mm; khối nội dung tiếp theo tự chuyển sang trang mới
khi không còn đủ chỗ trên trang hiện tại.
Danh sách đánh số chỉ được tạo khi chọn nút đánh số; nhập `1. ` không tự chuyển
thành danh sách. Cỡ chữ và font của dấu danh sách đồng bộ với nội dung.
Khi chọn văn bản, ô cỡ chữ hiển thị cỡ đang dùng; thay đổi cỡ chữ áp dụng cho
vùng chọn và giữ vùng chọn sau khi chỉnh sửa.
Thanh công cụ bám ngay dưới thanh tiêu đề khi cuộn tài liệu. Bộ đếm từ cập nhật
theo nội dung và bỏ qua các phần chỉ có dấu câu hoặc emoji.
Giao diện dùng font Arial; nội dung tài liệu mới mặc định dùng Times New Roman.
Cỡ chữ nội dung nhập theo point (pt); Times New Roman được hiệu chỉnh theo kích
thước hiển thị Google Docs, còn các font khác giữ nguyên cỡ point đã nhập.
