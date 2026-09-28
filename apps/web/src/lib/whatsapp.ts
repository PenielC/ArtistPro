/** WhatsApp's click-to-chat: opens WhatsApp with the message ready; the user picks the chat and sends it themselves. */
export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
