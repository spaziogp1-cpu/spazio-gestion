"""Fotos y links de los productos en spaziodesign.net (relevado el 20/10/2026).

Genera supabase/importaciones/2026-10_fotos_productos.sql. La foto es la primera imagen
del producto en Tienda Nube (tamaño 640 px). Se puede correr de nuevo: pisa la foto y el link.
"""
BASE = "https://www.spaziodesign.net/productos/"
CDN = "https://acdn-us.mitiendanube.com/stores/006/675/281/products/"

FOTOS = {
    "Combo Silla Cesca": ("combo-silla-cesca-t983v", "gemini_generated_image_ypm9h0ypm9h0ypm9-8ca3de2cd7e239eb4b17920835921834"),
    "Combo Silla Duna": ("combo-silla-duna-vsma0", "gemini_generated_image_l9nql6l9nql6l9nq-8d15021f1f71a9981817920834686869"),
    "Mesa Canoa Redonda": ("canoa-redonda-1aaqt", "sape-loca-f7fb18caa3e157c4ac17896604113148"),
    "Mesa Nube": ("mesa-nube-1cfe5", "sape-e29b9559cbca5dc33a17885322240995"),
    "Mesa Aire Alta Redonda": ("mesa-aire-alta-redonda-1q7xf", "render-1-2299492b8d32ee88bf17882773321308"),
    "Mesa Aire Ratona Rectangular": ("mesa-aire-ratona-rectangular-dz76a", "render-1-33f39ada1028f9cdcc17882729475487"),
    "Mesa Aire Ratona Redonda": ("mesa-aire-ratona-redonda-1r9yg", "render-3-8305604c88360cbae217882672803511"),
    "Mesa Tierra con Estante": ("mesa-tierra-con-estante-h0tz7", "untitled-1-c138a6e703819316a717622768654773-1024-1024-c4ef93b49116fa457017882026191004"),
    "Mesa Júpiter": ("mesa-jupiter-ngo13", "chatgpt-image-17-sept-2026-01_01_46-p-m-46e20087acd21af3ac17896609374222"),
    "Mesa Aire Alta Rectangular": ("mesa-aire-alta-e1apv", "render-89c4375253cb80357e17877671512507"),
    "Mesa Saturno": ("mesa-saturno-10cge", "chatgpt-image-24-ago-2026-12_34_02-p-m-e9b79ee2ba72e4b13617875856676487"),
    "Mesa Lucero Rectangular": ("mesa-lucero-rectangular-fodwu", "untitled-1-a8980b1cbc6f037b0c17851751053288"),
    "Mesa Ceres": ("me-12h1r", "vol1-577b19ff4a8993159417849143647985"),
    "Mesa Astra Dúo Recta": ("mesa-astra-duo-recta-a7uwh", "2-0a1e6c079abcf2841017847433498805"),
    "Vinilero Lyra": ("vinilero-lyra-cxeqi", "render-2-b6ebd9e257ea65c75717857654058336"),
    "Mesa Arcos": ("mesa-arcos-7epra", "render-2-b5a41e6a7c46d7651717842315762721"),
    "Estantería Prisma": ("estanteria-c9zk8", "chatgpt-image-11-jun-2026-03_59_15-p-m_-64c1f0b1a277e7ef7217812047127606"),
    "Espejo Tótem": ("espejo-totem-bg5kq", "plata-con-bisel-0eeb36ad88903c87da17811174481900"),
    "Espejo Rectangular": ("espejo-rectangular-qs78s", "rosa-ea042f7afd36d5c22817811169958632"),
    "Espejo Púa": ("espejo-pua-vuaoq", "plata-07ee7af666260fd65717811168575574"),
    "Espejo Gota": ("espejo-gota-1apoa", "azul-6226ff2be3b57ef72c17811164298918"),
    "Espejo Capilla": ("espejo-capilla-mkcze", "naranja-b9954cad2d3031d46317811160930628"),
    "Espejo Bote": ("espejo-bote-1glbf", "plata-7df9f228c28dc3b4bf17811156219535"),
    "Espejo Medio Punto": ("espejo-mediopunto-kz0hs", "amarillo-171a0894d27c723e2017811152890744"),
    "Recibidor Tori": ("recibidor-tori-yhj0k", "1-39967b804a4cb2231b17812902193598"),
    "Mesa Lucero Medio Punto": ("mesa-gravedad-alta-1hh5y", "demner-a01f3e3b42926eb40e17809463349247"),
    "Mesa Boreal": ("imagenes-ilustrativas-17f1f", "chatgpt-image-2-jun-2026-04_04_54-p-m-0497c6a9f86dd570dd17804275108008"),
    "Estantería Halo": ("estanteria-halo-m1tw4", "chatgpt-image-2-jun-2026-04_24_31-p-m-7e3bcb9095f8dd746a17804282991718"),
    "Mesa Tiempo": ("mesa-tiempo-wiu89", "chatgpt-image-2-jun-2026-04_33_45-p-m-f1f859c9e669e8f52e17804288529845"),
    "Recibidor Nexo": ("recibidor-halo-1azgv", "1-8f468ab52c243cff7917799965723255"),
    "Mesa Helios": ("mesa-helios-sin-estante-ct15b", "sa-783e833278f9d83a3817903475123237"),
    "Mesa Helios con estante": ("mesa-helios-con-estante-15y1z", "1-d0d1922dabf60361d717799959903746"),
    "Mesa DJ": ("mesa-de-dj-j7e11", "1-d8506a8564b79d712117900944753990"),
    "Escritorio Tierra": ("escritorio-tierra-j4fqs", "1-23-bcdf31482267184f7817784630057051"),
    "Mesa Constelación Ratona": ("constelacion-ratona-1t63x", "estudio-a0f05965c761e0920417770491651062"),
    "Espejo Eco": ("espejo-eco-19jlc", "1-1-9f62e178ed0814d8fe17769765239422"),
    "Bar Spazio": ("bar-spazio-15xkj", "escena-2-5-95f91acba8252523e317765332396888"),
    "Mesa Binario": ("mesa-binario-6pkw2", "estudio-22-a7151212c8e15f804017765324363684"),
    "Mesa Constelación": ("mesa-constelacion-nj62l", "jeje-b034c5f3109afbb7ed17709085428421"),
    "Mesa Órbita": ("mesa-orbita-1scoc", "untitled-1-12-06fc80dd5d68a0a7a717709081852816"),
    "Rack Núcleo": ("rack-nucleo-3auyx", "escena-2-3-7f760447b9be18eaa717709079803190"),
    "Mesa Estelar": ("mesa-estelar-cfo8u", "chatgpt-image-2-sept-2026-12_29_51-p-m-fc6b207e81b154ed2817883630473692"),
    "Mesa Lux": ("mesa-lux-1lj6f", "escena-1-d405b328520d36a58e17709069220384"),
    "Estantería Aurora": ("estanteria-aurora-1kd6i", "render-1-1-454a5b8199db87166b17709060637428"),
    "Módulo": ("modulo-3gonp", "untitled-2-c72b190d19450ff2c817894848447375"),
    "Mesa Zenit": ("mesa-zenit-19imu", "untitled-1-7d7c22972e103a385117700551353041"),
    "Mesa Luna": ("mesa-luna", "chatgpt-image-3-sept-2026-01_33_33-p-m-7c0eb24cf917b426e317884532385335"),
    "Mesa Tierra": ("mesa-tierra", "sape-988b139bde89afec7317884540996642"),
    "Mesa Venus": ("mesa-venus", "chatgpt-image-10-jun-2026-04_05_39-p-m-4884e35a74f42b7aac17811183534977"),
    "Mesa Gravedad": ("mesa-gravedad", "chatgpt-image-17-jun-2026-03_56_51-p-m-cc0c534d5157fb79ef17817226310794"),
    "Mesa Palta": ("mesa-palta", "chatgpt-image-25-nov-2025-02_19_52-p-m-a7a65d36be227c945b17649527260223"),
    "Mesa Eclipse": ("mesa-eclipse", "chatgpt-image-19-jun-2026-03_39_18-p-m-a7a0eec4d58f89724417818943864303"),
    "Mesa Atlas": ("mesa-atlas", "real-shit-ab091c18951c3c4b9f17691047066334"),
    "Mesa Sol": ("mesa-sol", "chatgpt-image-12-jun-2026-02_44_54-p-m-43b2e36ad24655525917812863039243"),
    "Mesa Luz": ("mesa-luz", "chatgpt-image-19-jun-2026-04_49_42-p-m-e4fbcbbdfbba33295b17818985929411"),
    "Mesa Galaxia": ("mesa-galaxia", "untitled-1-27f15bc95dd7f8e2d717652906790119"),
    "Mesa Galaxia II": ("mesa-galaxia-ii", "b187e575-0a1c-41fd-8fed-5ac0ffe20ad8-580a3c69a4077cd17717706417043788"),
    "Mesa Universo": ("mesa-universo", "34eee518-1f99-433d-b169-cad44a148447-1a71bbc8922971dc8217706419545568"),
    "Mesa Nova": ("mesa-nova", "verti-eb9c7405d3faf584a517653024382846"),
    "Mesa Cubo": ("mesa-cubo", "chatgpt-image-19-jun-2026-03_17_00-p-m-b9c31020595471851617818930346645"),
    "Mesa Cósmico": ("mesa-cosmico", "088e858d-7084-408c-838b-0ab4465b882c-c15bf47ae12e5432f717707437056200"),
    "Espejo Mercurio": ("espejo-mercurio", "tn-2-38bc9b641792df26cb17653868275415"),
    "Espejo Neptuno": ("espejo-neptuno", "tn-1-ac5303bbf04687b08517653868079372"),
    "Espejo Nébula": ("espejo-nebula", "tn-3-468e4dc1cc61e16b8317653870746926"),
    "Espejo Cosmos": ("espejo-cosmos", "tn-4-b7b87a963622f06d8517653878410736"),
    "Espejo Círculo": ("espejo-kepler", "bronce-5184ca5588e3680bd317811109498770"),
    "Mesa Canoa": ("mesa-canoa-w4see", "render-1-bbd85a786b7b91fcd617621932402998"),
    "Mesa Auxiliar Canoa": ("auxiliar-canoa-2jone", "untitled-5-aa66926f67b8dd5f0817621935310713"),
    "Mesa Astra Dúo": ("mesa-astra-duo-40thl", "artboard-1-awe-0a22a37c1b0ef166a117649555790972"),
    "Mesa Gravedad II": ("mesa-gravedad-ii-1r08o", "9235ef4c-a97d-4775-a047-8e577db22873-898e21c67b0d57c9b617690950518007"),
    "Módulo II": ("modulo-ii-11rzr", "frente-1-57226d2684231ce02a17745399475074"),
    "Estantería Lyra": ("estanteria-lyra-1vpyf", "gemini_generated_image_wuomb2wuomb2wuom-7a8156acca1e37ef0817913967572832"),
}

q = lambda s: "'" + s.replace("'", "''") + "'"
filas = ",\n".join(f"  ({q(n)}, {q(CDN + img + '-640-0.webp')}, {q(BASE + slug + '/')})" for n, (slug, img) in FOTOS.items())
sql = f"""-- =====================================================================
-- Spazio Design · Cotizador · Fotos y links de la web (20/10/2026)
-- Generado por scripts/cotizador/fotos_web.py. Se puede correr de nuevo.
-- =====================================================================
update public.cot_productos p set foto_url = v.foto, tiendanube_url = v.url
from (values
{filas}
) as v(nombre, foto, url)
where lower(p.nombre) = lower(v.nombre) and p.activo;
"""
open("supabase/importaciones/2026-10_fotos_productos.sql", "w").write(sql)
print(len(FOTOS), "fotos")
