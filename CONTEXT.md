# Linkly

Linkly gathers customer communication from multiple channels into one workspace for customer-service and sales teams.

## Conversations

**Conversation**:
A tenant-scoped communication thread between one customer and the team through one Channel.
_Avoid_: Chat, ticket

**Customer Reply**:
A team-authored message delivered to a customer through the Conversation's Channel.
_Avoid_: Outbound note, agent message

**Internal Note**:
A team-authored message stored in a Conversation for coworkers and never delivered to the customer.
_Avoid_: Private reply, customer message

**Channel**:
The external communication surface that carries customer messages, such as WhatsApp, Instagram, email, Telegram, SMS, or the website widget.
_Avoid_: Provider, platform

**Message Delivery**:
The complete lifecycle that accepts a Customer Reply or Internal Note, delivers it when required, and records its outcome in the Conversation.
_Avoid_: Send handler, message route
