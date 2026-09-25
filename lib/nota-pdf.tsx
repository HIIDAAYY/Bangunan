import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatQty, formatRupiah, formatTanggalWaktu } from "./format";
import { TOKO } from "./store";

export type NotaData = {
  id: number;
  createdAt: Date;
  customer: { phone: string; name: string | null };
  catatanPengiriman: string | null;
  total: number;
  items: { sku: string; nama: string; satuan: string; qty: number; hargaSatuan: number; subtotal: number }[];
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1d2b33" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#1d2b33", paddingBottom: 12 },
  toko: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  muted: { color: "#5b6760" },
  judul: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  info: { flexDirection: "row", marginTop: 16, marginBottom: 16 },
  infoCol: { flex: 1, paddingRight: 12 },
  label: { color: "#5b6760", marginBottom: 2 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#c9cdc8" },
  headRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#1d2b33", color: "#5b6760" },
  cNo: { width: 20 },
  cNama: { flex: 1, paddingRight: 8 },
  cQty: { width: 70, textAlign: "right" },
  cHarga: { width: 80, textAlign: "right" },
  cSub: { width: 90, textAlign: "right" },
  sku: { fontSize: 8, color: "#5b6760" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, paddingTop: 8, borderTopWidth: 2, borderTopColor: "#1d2b33" },
  total: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 40, left: 40, right: 40, color: "#5b6760", fontSize: 9 },
});

function Nota({ order }: { order: NotaData }) {
  return (
    <Document title={`Nota Pesanan #${order.id}`} author={TOKO.nama}>
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.toko}>{TOKO.nama}</Text>
            <Text style={s.muted}>{TOKO.alamat}</Text>
            <Text style={s.muted}>WA {TOKO.telepon}</Text>
          </View>
          <View>
            <Text style={s.judul}>NOTA PESANAN</Text>
            <Text style={{ textAlign: "right" }}>No. #{order.id}</Text>
            <Text style={[s.muted, { textAlign: "right" }]}>{formatTanggalWaktu(order.createdAt)} WIB</Text>
          </View>
        </View>

        <View style={s.info}>
          <View style={s.infoCol}>
            <Text style={s.label}>Pelanggan</Text>
            <Text>{order.customer.name ?? order.customer.phone}</Text>
          </View>
          <View style={s.infoCol}>
            <Text style={s.label}>Pengiriman</Text>
            <Text>{order.catatanPengiriman ?? "-"}</Text>
          </View>
        </View>

        <View style={s.headRow}>
          <Text style={s.cNo}>No</Text>
          <Text style={s.cNama}>Barang</Text>
          <Text style={s.cQty}>Jumlah</Text>
          <Text style={s.cHarga}>Harga</Text>
          <Text style={s.cSub}>Subtotal</Text>
        </View>
        {order.items.map((item, i) => (
          <View style={s.row} key={item.sku + i} wrap={false}>
            <Text style={s.cNo}>{i + 1}</Text>
            <View style={s.cNama}>
              <Text>{item.nama}</Text>
              <Text style={s.sku}>{item.sku}</Text>
            </View>
            <Text style={s.cQty}>
              {formatQty(item.qty)} {item.satuan}
            </Text>
            <Text style={s.cHarga}>{formatRupiah(item.hargaSatuan)}</Text>
            <Text style={s.cSub}>{formatRupiah(item.subtotal)}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.total, { marginRight: 16 }]}>Total</Text>
          <Text style={s.total}>{formatRupiah(order.total)}</Text>
        </View>

        <Text style={s.footer} fixed>
          Simpan nota ini sebagai bukti pesanan. Terima kasih atas pesanan Anda.
        </Text>
      </Page>
    </Document>
  );
}

export function renderNotaPdf(order: NotaData): Promise<Buffer> {
  return renderToBuffer(<Nota order={order} />);
}
