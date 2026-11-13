# CoopConnect Project Progress Tracker

ตัวติดตามความคืบหน้าการพัฒนาโครงงานพิเศษ CoopConnect จำนวน 68 ข้อ แบ่งเป็น 10 สัปดาห์ ใช้ HTML, CSS และ JavaScript แบบไม่ต้องมี Backend

## ไฟล์

- `index.html` — โครงหน้า Dashboard รายการสัปดาห์ ตัวกรอง และรายการงาน
- `styles.css` — ธีมสีน้ำเงิน-ขาวและ Responsive Design
- `data.js` — ขอบเขตงานทั้ง 68 ข้อ เลขข้อ PDF บทบาท รายละเอียดเต็ม และแผนรายสัปดาห์
- `app.js` — สถานะความคืบหน้า ค้นหา กรองงาน โน้ต LocalStorage และ Export/Import JSON

## การใช้งาน

เปิด `index.html` โดยตรง หรือใช้ VS Code Live Server / GitHub Pages ได้ทันที

สถานะเริ่มต้นของทุกงานคือ **ยังไม่เริ่ม** และคำนวณความคืบหน้าจากจำนวนงานที่เป็น **เสร็จแล้ว** เท่านั้น งานที่กำลังดำเนินการยังไม่ถูกนับเป็นงานเสร็จ

ข้อมูลความคืบหน้าและโน้ตถูกเก็บใน LocalStorage ด้วย key `coopconnect-project-progress-v3` แยกจากข้อมูลขอบเขตใน `data.js` เวอร์ชันก่อนหน้าจะไม่ถูกโหลดอัตโนมัติ ปุ่มรีเซ็ตจะล้างเฉพาะข้อมูลของ Tracker นี้

Export และ Import ใช้ไฟล์ JSON รูปแบบเดียวกัน และตรวจสอบรหัสงานกับสถานะก่อนนำเข้า

## การแบ่งงาน

| สัปดาห์ | จำนวน |
| --- | ---: |
| 1 | 7 |
| 2 | 8 |
| 3 | 6 |
| 4 | 6 |
| 5 | 7 |
| 6 | 8 |
| 7 | 7 |
| 8 | 9 |
| 9 | 8 |
| 10 | 2 |
| **รวม** | **68** |

 
## Supabase shared progress

- ความคืบหน้าทั้ง 68 ข้อและโน้ตเป็นข้อมูลกลางจากตาราง `public.tracker_progress` (ไม่ใช้ LocalStorage v3 สำหรับสถานะอีกแล้ว)
- ประชาชนทั่วไปอ่านได้; การแก้ไขต้องล็อกอินและมี UID อยู่ใน `public.tracker_editors` ตาม RLS policy
- Realtime ต้องเปิด `supabase_realtime` สำหรับตาราง `tracker_progress`
- หากคำเชิญอีเมลหมดอายุ ใช้ “ขอลิงก์ตั้งรหัสผ่าน” บนเว็บไซต์แทน เมื่อยืนยันตัวตนแล้วตั้งรหัสผ่านใหม่
- Import / Reset เป็นการแก้ไขข้อมูลกลางสำหรับทุกคน เฉพาะบัญชีผู้มีสิทธิ์
- **โน้ตเป็นข้อมูลสาธารณะ** ห้ามใส่ข้อมูลลับหรือข้อมูลส่วนบุคคล
- Publishable Key ใน cloud.js ใช้บนเว็บได้เมื่อ RLS ถูกต้อง; ห้ามนำ Secret Key, service_role หรือ Database Password ลงโค้ด
- ให้สิทธิ์ผู้แก้ไขหลังสร้างบัญชีใน Authentication → Users โดยใช้ SQL Editor:
  `insert into public.tracker_editors(user_id) values ('YOUR-REAL-USER-UUID') on conflict(user_id) do nothing;`
- ก่อน Merge PR ต้องทดสอบกับ Supabase จริงและบัญชีผู้แก้ไข/ผู้ชมสองเบราว์เซอร์ ตรวจ Console, Network และ GitHub Pages ด้วย


## สร้าง Tracker ใหม่ด้วย Template หน้าตาเดิม

เปิดหน้า [Tracker Template](./template.html) เพื่อสร้างโปรเจกต์ใหม่ โดยไม่เปลี่ยน CoopConnect 68 ข้อเดิม

หน้า Template ใช้ธีมเดียวกับเว็บเดิม แต่โปรเจกต์ใหม่เริ่มจาก **0 สัปดาห์ / 0 ข้อ** ผู้มีสิทธิ์ Editor สามารถ:

- สร้างโปรเจกต์ใหม่, เปลี่ยนชื่อ/คำอธิบาย และเลือกสลับโปรเจกต์
- เพิ่ม/แก้ไข/ลบสัปดาห์ พร้อมเป้าหมาย งานที่ทำร่วมกัน และผลส่งมอบ
- สร้าง 10 สัปดาห์ว่างพร้อมกัน หรือเพิ่มเองทีละสัปดาห์
- เพิ่ม/แก้ไข/ย้ายสัปดาห์/ลบข้อ โดยมีเลขอ้างอิง ชื่อเต็ม บทบาท และรายละเอียดเต็ม
- เปลี่ยนสถานะ เพิ่มโน้ต ค้นหา กรองงาน และดูแถบความคืบหน้ารายสัปดาห์
- บันทึกทุกการเปลี่ยนแปลงลง Supabase เพื่อใช้ร่วมกัน

### ตั้งค่า Supabase ก่อนใช้งาน

1. เข้า Supabase Project ที่ใช้กับเว็บไซต์ → SQL Editor → New Query
2. เปิดไฟล์ [supabase/CREATE_CUSTOM_TRACKER.sql](supabase/CREATE_CUSTOM_TRACKER.sql) แล้วนำ SQL ทั้งหมดไปรันใน SQL Editor
3. ตรวจว่ามีตาราง tracker_custom_projects, tracker_custom_weeks และ tracker_custom_tasks
4. ยืนยันบัญชีของคุณมี UID ใน tracker_editors ตามขั้นตอนเดิม
5. เปิด template.html ผ่าน GitHub Pages แล้วล็อกอินด้วยบัญชี Editor

**สิทธิ์และความเป็นส่วนตัว:** คนทั่วไปดูโปรเจกต์ ข้อ และโน้ตได้ ส่วนสมาชิก tracker_editors ทุกคนแก้ไขโปรเจกต์ Template ได้ทุกโปรเจกต์ ยังไม่มีสิทธิ์แยกตามโปรเจกต์ อย่าใส่ข้อมูลลับลงในโน้ต

**เรื่อง Deploy:** ห้ามนำเข้า main ก่อนตรวจการตั้งค่า SQL / ทดสอบสิทธิ์ RLS และการทำงานจริง หน้า template.html จะแสดงข้อความแจ้งเมื่อยังไม่มีตาราง Supabase

**ความปลอดภัย:** ใช้เฉพาะ Publishable Key ใน Frontend และตรวจการเขียนด้วย RLS; ห้ามใส่ Secret Key, Service Role Key หรือรหัสผ่านฐานข้อมูลใน Repository
