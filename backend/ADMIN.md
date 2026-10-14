# Yönetici paneli

## İlk yönetici hesabı

1. `backend/.env` dosyasına aşağıdaki değerleri ekleyin. E-posta ve şifreyi kendiniz belirleyin; bu değerleri Git'e eklemeyin.

   ```env
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=en-az-12-karakterlik-guclu-bir-sifre
   ```

2. Backend klasöründe önce `npm run db:migrate`, ardından `npm run admin:create` komutunu çalıştırın. İlk komut rol alanını ve tabloları hazırlar. İkinci komut hesabı oluşturur; aynı e-posta zaten kayıtlıysa hesabı yöneticiye yükseltir ve şifresini `ADMIN_PASSWORD` ile günceller.
3. Yeni hesap oluşturulduktan sonra `ADMIN_PASSWORD` satırını `.env` dosyasından kaldırabilirsiniz. Şifre veritabanında scrypt ile özetlenmiş olarak saklanır.
4. Backend'i `npm start` ile çalıştırın; ürün eklemek için mağazanın `admin.html` sayfasını açın. Live Server kullanırken adres genellikle `http://127.0.0.1:5500/admin.html` olur.

Migration, `npm start` öncesinde `users.role` alanını ekler. Panelde bir ürüne birden fazla beden-renk-varyantı aynı anda eklenebilir. Yönetici oturumu normal giriş çerezini kullanır; ürün oluşturma ve stok değiştirme API'leri her istekte veritabanındaki yönetici rolünü kontrol eder. Görsel yüklemek yerine görsel bağlantısı girilir.
