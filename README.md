Base URL: https://it4409-nhom8-backend.onrender.com/

1. Đăng ký tài khoản (Register)
    URL: /api/auth/register
    Method: POST
    Request Body: 
    {
      "username": "nguyenvanan",
      "email": "an.nguyen@example.com",
      "password": "password123"
    }
2. Đăng nhập (Login)
Xác thực người dùng và trả về JWT Token.
    URL: /api/auth/login
    Method: POST
    Request Body:
    {
      "username": "nguyenvanan",
      "password": "password123"
    }
3. Lấy thông tin cá nhân (Get Me)
Lấy thông tin của người dùng hiện tại đang đăng nhập.
    URL: /api/auth/me
    Method: GET
    Headers: Authorization: Bearer <token>
4. Đổi mật khẩu (Change Password)
Thay đổi mật khẩu khi người dùng đã đăng nhập.
    URL: /api/auth/change-password
    Method: PUT
    Headers: Authorization: Bearer <token>
    Request Body:
    {
      "currentPassword": "password123",
      "newPassword": "newSecurePassword456"
    }
5. Quên mật khẩu - Gửi mã (Forgot Password)
Yêu cầu mã khôi phục mật khẩu gửi qua email.
    URL: /api/auth/forgot-password
    Method: POST
    Request Body:
    { "email": "tranthibinh@example.com" }
6. Đặt lại mật khẩu (Reset Password)
Sử dụng mã nhận được từ email để thiết lập mật khẩu mới.
    URL: /api/auth/reset-password
    Method: POST
    Request Body:
    {
      "email": "tranthibinh@example.com",
      "code": "A1B2C3",
      "newPassword": "binhPassword789"
    }
7. Đăng xuất (Logout)
Đăng xuất khỏi phiên làm việc hiện tại.
    URL: /api/auth/logout
    Method: POST
