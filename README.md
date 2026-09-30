# موقع تقارير المناديب - أفق (hm)

## التشغيل (مرة واحدة)
1. **Supabase → SQL Editor**: الصق محتوى `hm_schema.sql` واضغط Run.
   (كل الجداول بادئتها `hm_`، والسكريبت إنشاء فقط ولا يلمس جداول الموقعين التانيين.)
2. **Authentication → Users → Add user**: الإيميل `hm@example.com` وكلمة المرور `hm-9876-ufuq` (مع Auto Confirm User). عند الدخول في الموقع تكتب `9876` بس.
3. في SQL Editor شغّل (بعد تعديل الإيميل والاسم):
   ```sql
   insert into public.hm_users (user_id, name, role)
   select id, 'اسمك', 'manager' from auth.users where email = 'hm@example.com'
   on conflict do nothing;
   ```
4. ارفع محتوى المجلد ده في مستودع GitHub جديد، ثم **Settings → Pages → Deploy from branch (main / root)**.
5. افتح الرابط، سجّل دخول، وضيف المنتجات والمحلات من "المنتجات والمحلات".

## ملاحظات
- `config.js` فيه رابط المشروع والـ anon key فقط (آمن للمتصفح). لا تضع service_role هنا أبدًا.
- الصور خاصة (bucket اسمه `hm-photos`) ولا تُفتح إلا لمستخدمين مسجلين في `hm_users`.
- التقرير: من "تقرير نهائي" اضغط طباعة ثم اختر "حفظ كـ PDF".
