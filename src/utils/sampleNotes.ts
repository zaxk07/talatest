export const SAMPLE_NAME = 'Sample Lecture Notes (Networks & OS).md'

/** Rich demo notes that exercise every extraction pattern. */
export const SAMPLE_NOTES = `# The OSI Model
The **OSI model** is defined as a seven-layer conceptual framework that standardises how network systems communicate.
- **Physical layer**: transmits raw bits over a physical medium such as copper cable or fibre.
- **Data Link layer**: provides node-to-node delivery and error detection using MAC addresses.
- **Network layer**: handles logical addressing and routing of packets between networks.
- **Transport layer**: provides end-to-end delivery, segmentation, and flow control between hosts.
- Because each layer only talks to its neighbours, engineers can change one layer without rewriting the others.

# Transport Protocols
Transmission Control Protocol (TCP) is a connection-oriented protocol that guarantees ordered, reliable delivery of data.
User Datagram Protocol (UDP) is a connectionless protocol that trades reliability for low latency.
- **Three-way handshake**: the SYN, SYN-ACK, ACK exchange used by TCP to establish a connection.
- **Congestion control** refers to the techniques TCP uses to avoid overwhelming the network with too much traffic.
- Packet loss leads to retransmission in TCP, which increases delay.
- UDP is commonly used for streaming and online games because it avoids retransmission delays.

# Addressing and Naming
- **IP address**: a numeric label that identifies a device on a network and its location.
- **Domain Name System (DNS)** is a hierarchical service that translates human-readable domain names into IP addresses.
- **Subnet mask**: divides an IP address into network and host portions.
- **DHCP** stands for Dynamic Host Configuration Protocol, which automatically assigns IP addresses to devices.
- **NAT** is a technique that lets many private devices share one public IP address.
- Caching DNS answers results in faster page loads because repeated lookups are avoided.

# Processes and Threads
A **process** is a program in execution with its own address space and resources.
A **thread** is the smallest unit of CPU execution that shares memory with other threads in the same process.
- **Context switch**: the act of saving one process's state and loading another's so the CPU can be shared.
- **Scheduler**: the operating system component that decides which process runs next on the CPU.
- Excessive context switching reduces throughput because the CPU spends time on overhead instead of useful work.
- **Round Robin** scheduling gives each process a fixed time slice in turn, which keeps response times fair.

# Memory Management
- **Virtual memory**: a technique that gives each process the illusion of a large, private address space by using disk as an extension of RAM.
- **Paging** is defined as dividing memory into fixed-size blocks called pages and frames to avoid external fragmentation.
- **Page fault**: an event that occurs when a process accesses a page that is not currently in physical memory.
- **Thrashing** refers to a state where the system spends more time swapping pages than executing processes.
- Too many running processes cause thrashing when physical memory is insufficient.
- **Translation Lookaside Buffer (TLB)**: a small, fast cache that stores recent virtual-to-physical address translations.

# Synchronization and Deadlocks
- **Mutex**: a locking mechanism that allows only one thread at a time to enter a critical section.
- **Semaphore**: a signalling counter used to control access to a shared resource by multiple threads.
- **Race condition**: a flaw where the outcome depends on the unpredictable timing of concurrent operations.
- A **deadlock** is a situation in which two or more processes wait forever for resources held by each other.
- When circular wait, hold and wait, no preemption, and mutual exclusion all hold, a deadlock can occur.
- Acquiring locks in a fixed global order prevents circular wait, so deadlocks are avoided.
`
