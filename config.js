// إعدادات الاتصال بـ Supabase
// الـ anon key مخصص للاستخدام داخل المتصفح، والحماية الفعلية من سياسات RLS في قاعدة البيانات.
// لا تضع هنا مفتاح service_role أبدًا.
window.HM_CONFIG = {
  SUPABASE_URL: "https://guorxzejmtvypiwxrogf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b3J4emVqbXR2eXBpd3hyb2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzI2NjksImV4cCI6MjEwNTMwODY2OX0.o95p3N83NLU8ZKZG5LtwS95iR1W3eN03qixqjsnWk_8",
  // الدخول بكلمة سر فقط: الإيميل ثابت ومخفي عن المستخدم (لا يُرسل له أي بريد)
  LOGIN_EMAIL: "hm@example.com",
  // Supabase يشترط 6 خانات على الأقل، فبنضيف بادئة ولاحقة على كلمة السر اللي بتكتبها
  PW_PREFIX: "hm-",
  PW_SUFFIX: "-ufuq",
  ALERT_DAYS: 60,      // تنبيه لأي منتج باقي على انتهائه أقل من شهرين
  DANGER_DAYS: 30      // أحمر لأقل من شهر
};
