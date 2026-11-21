import Swal from 'sweetalert2'

export const alertNotify = {
  success(message: string, title: string = 'Berhasil!') {
    return Swal.fire({
      title,
      text: message,
      icon: 'success',
      confirmButtonColor: '#3B82F6',
    })
  },
  error(message: string, title: string = 'Terjadi Kesalahan!') {
    return Swal.fire({
      title,
      text: message,
      icon: 'error',
      confirmButtonColor: '#EF4444',
    })
  },
  warning(message: string, title: string = 'Peringatan!') {
    return Swal.fire({
      title,
      text: message,
      icon: 'warning',
      confirmButtonColor: '#F59E0B',
    })
  },
  info(message: string, title: string = 'Informasi') {
    return Swal.fire({
      title,
      text: message,
      icon: 'info',
      confirmButtonColor: '#3B82F6',
    })
  },
  async confirm(message: string, title: string = 'Apakah Anda yakin?') {
    const result = await Swal.fire({
      title,
      text: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3B82F6',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Ya, Lanjutkan',
      cancelButtonText: 'Batal'
    })
    return result.isConfirmed
  }
}

export default alertNotify