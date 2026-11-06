document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // 1. GAME STATE & DOM ELEMENTS (ตัวแปรสถานะและหน้าจอ)
    // ==========================================
    let coins = 0; // ยอดเหรียญ AEGIS ที่มี
    let currentAccount = null; // กระเป๋า MetaMask ที่เชื่อมต่อ
    let unsavedCoins = 0;


    // พื้นหลังหลัก
    const gameContainer = document.querySelector(".game-container");

    // หน้า Lobby UI
    const menuBox = document.querySelector(".menu-box");
    const logoContainer = document.querySelector(".logo-container");
    const topNav = document.querySelector(".top-right-nav");
    const btnDemo = document.getElementById("btn-demo");
    const btnPlay = document.getElementById("btn-play");
    const btnVault = document.getElementById("btn-vault");
    const lobbyCoins = document.getElementById("lobby-coin");
    const lobbyCoinBox = document.getElementById("lobby-coin-box");
    // หน้า Game UI
    const gameUI = document.getElementById("game-ui");
    const btnBack = document.getElementById("btn-back");
    const roshanChar = document.getElementById("roshan-character");
    const coinCount = document.getElementById("coin-count");
    const warning = document.getElementById("warning");

    // หน้า Vault Modal (ถอนเงิน)
    const vaultModal = document.getElementById("vault-modal");
    const btnCloseVault = document.getElementById("btn-close-vault");
    const btnConfirmWithdraw = document.getElementById("btn-confirm-withdraw");
    const vaultBalanceDisplay = document.getElementById("vault-balance");
    const withdrawAmountInput = document.getElementById("withdraw-amount");

    // ระบบ Web3 UI
    const btnConnect = document.getElementById("btn-connect");


    // ==========================================
    // SMART CONTRACT CONFIGURATION
    // ==========================================
    // ** อัปเดต CONTRACT_ADDRESS และ URL ของ Backend ให้ตรงกับของจริง **
    const CONTRACT_ADDRESS = "0x7c7b48e48136c84d0c53479601c579D3c73bf657";
    const BACKEND_API_URL = "https://aegiscoin-backend.onrender.com/api/withdraw";
    const ABI = [
        "function claimMint(uint256 amount, uint256 nonce, uint8 v, bytes32 r, bytes32 s) public"
    ];

    // ==========================================
    // 2. NAVIGATION & VAULT (ระบบเปลี่ยนหน้าต่างและการถอนเงิน)
    // ==========================================

    // เข้าโหมด DEMO 
    btnDemo.addEventListener("click", () => {
        menuBox.style.display = "none";
        logoContainer.style.display = "none";
        topNav.style.display = "none";
        gameUI.style.display = "block";
        gameContainer.style.backgroundImage = "url('img/bg-pit.jpg')";
    });

    // เข้าโหมด play
    btnPlay.addEventListener("click", () => {
        menuBox.style.display = "none";
        logoContainer.style.display = "none";
        topNav.style.display = "none";
        gameUI.style.display = "block";
        gameContainer.style.backgroundImage = "url('img/bg-pit.jpg')";
    });

    // กลับหน้า Lobby
    btnBack.addEventListener("click", () => {
        syncScoreToBackend(); //เซฟก่อนกลับหน้าหลัก
        gameUI.style.display = "none";
        menuBox.style.display = "flex";
        logoContainer.style.display = "block";
        topNav.style.display = "flex";
        gameContainer.style.backgroundImage = "url('img/bg-lobby.jpg')";
    });

    // เปิดหน้าต่าง Vault (ถอนเงิน)
    btnVault.addEventListener("click", async() => {
        try {
            btnVault.disabled = true; // ล็อกปุ่มแป๊บนึง
            await syncScoreToBackend() // บังคับเซฟแต้มล่าสุดลง Database ก่อน

            vaultBalanceDisplay.innerText = coins; // อัปเดตยอดก่อนโชว์หน้าต่าง
            withdrawAmountInput.value = ""; // เคลียร์ช่อง input
            vaultModal.style.display = "flex";
        } catch (error) {
            // ถ้ามีอะไรพังระหว่างทาง ให้มันฟ้องใน Console (F12) จะได้รู้สาเหตุ
            console.error("เกิดข้อผิดพลาดตอนเปิด Vault:", error);
        } finally {

            btnVault.disabled = false;
            btnVault.innerText = "WITHDRAW";
        }
    });

    // ปิดหน้าต่าง Vault
    btnCloseVault.addEventListener("click", () => {
        vaultModal.style.display = "none";
    });

    // ==========================================
    // ระบบถอนเงิน (WITHDRAW TO BLOCKCHAIN)
    // ==========================================
    btnConfirmWithdraw.addEventListener("click", async() => {
        const amount = Number(withdrawAmountInput.value);

        // 1. ตรวจสอบยอดเบื้องต้น
        if (amount > coins) return alert("ยอดเหรียญ AEGIS ไม่เพียงพอ!");
        if (amount <= 0 || !amount) return alert("กรุณาระบุจำนวนเหรียญที่ต้องการถอนให้ถูกต้อง");
        if (!currentAccount) return alert("กรุณาเชื่อมต่อกระเป๋าก่อนถอนเงิน");

        try {
            // 2. ล็อกปุ่มกันกดซ้ำ
            btnConfirmWithdraw.innerText = "Processing...";
            btnConfirmWithdraw.disabled = true;

            // 3. ยิง API ขอ Signature จาก Backend
            const response = await fetch(BACKEND_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wallet_address: currentAccount,
                    amount: amount
                })
            });

            const data = await response.json();

            // เช็กว่า Backend ส่งตั๋วมาสำเร็จหรือไม่
            if (data.status !== "success") {
                throw new Error(data.error || "ไม่สามารถขอ Signature จากเซิร์ฟเวอร์ได้");
            }
            // ดึงชิ้นส่วนลายเซ็นออกมาจาก data.data ที่ Backend ห่อมาให้
            const signatureData = data.data;

            // 4. เชื่อมต่อ Ethers.js
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

            // 5. สั่ง MetaMask เด้งเพื่อเรียกใช้ Smart Contract
            const tx = await contract.claimMint(
                signatureData.amount,
                signatureData.nonce,
                signatureData.v,
                signatureData.r,
                signatureData.s
            )

            // 6. รอจนกว่าธุรกรรมจะสมบูรณ์บนเชน
            await tx.wait();

            // 7. เมื่อสำเร็จ หักยอดเหรียญในเกมและอัปเดตเหรียญ
            coins -= amount;
            coinCount.innerText = coins;
            lobbyCoins.innerText = coins;
            vaultBalanceDisplay.innerText = coins;

            alert("ถอนเงินสำเร็จ! เหรียญ Aegis เข้ากระเป๋าของคุณแล้ว");
            vaultModal.style.display = "none"; // ปิดหน้าต่าง

        } catch (error) {
            console.error("Withdraw Error:", error);
            // โชว์ Error ให้ผู้เล่นเห็น (เช่น กรณีกดปฏิเสธ MetaMask)
            alert("เกิดข้อผิดพลาด: " + (error.reason || error.message));
        } finally {
            // 8. คืนสถานะปุ่มกลับมาเหมือนเดิมเสมอ
            btnConfirmWithdraw.innerText = "Confirm Withdraw";
            btnConfirmWithdraw.disabled = false;
        }
    });


    // ==========================================
    // 3. CORE GAMEPLAY (ระบบคลิกตีบอส)
    // ==========================================

    // ตีมอน
    roshanChar.addEventListener("pointerdown", (e) => {
        if (currentAccount) {
            coins += 1;
            unsavedCoins += 1;
            coinCount.innerText = coins;
            lobbyCoins.innerText = coins;

            roshanChar.classList.add("attacking");
            roshanChar.classList.add("hit-effect");
            createFloatingCoin(e.clientX, e.clientY);
        } else {
            roshanChar.classList.add("attacking");
            roshanChar.classList.add("hit-effect");
            createFloatingCoin(e.clientX, e.clientY);
        }
    });

    // ปล่อยเมาส์ (คืนสภาพ)
    roshanChar.addEventListener("pointerup", () => {
        roshanChar.classList.remove("hit-effect");
        roshanChar.classList.remove("attacking");
    });

    // ลากเมาส์ออก (คืนสภาพกันบั๊ก)
    roshanChar.addEventListener("pointerleave", () => {
        roshanChar.classList.remove("hit-effect");
        roshanChar.classList.remove("attacking");
    });

    // สร้างตัวเลข "+1" ลอย
    function createFloatingCoin(x, y) {
        const floatEl = document.createElement("div");
        floatEl.classList.add("floating-coin");
        floatEl.innerHTML = `<img src="img/popup-coin.png" class="bouncing-coin-img">`;

        const offsetX = (Math.random() - 0.5) * 80;
        floatEl.style.left = `${x + offsetX}px`;
        floatEl.style.top = `${y - 40}px`;

        gameUI.appendChild(floatEl);
        setTimeout(() => floatEl.remove(), 800);
    }
    // ฟังก์ชันโหลดคะแนนจาก Database
    async function loadPlayerScore(walletAddress) {
        try {
            const response = await fetch(`https://aegiscoin-backend.onrender.com/api/player/${walletAddress}`);
            const data = await response.json();

            if (data.status === "success") {
                // เอาคะแนนจาก Database มาทับตัวแปรในเกม
                coins = Number(data.score);
                // อัปเดตตัวเลขบนหน้าจอ
                lobbyCoins.innerText = coins;
                coinCount.innerText = coins;
                vaultBalanceDisplay.innerText = coins;
            }
        } catch (error) {
            console.error("ไม่สามารถโหลดคะแนนได้:", error);
        }
    }
    // ฟังก์ชันส่งคะแนน Backend
    async function syncScoreToBackend() {
        // ถ้าไม่มีแต้มใหม่ให้เซฟ หรือยังไม่ได้ต่อกระเป๋า ก็ข้ามไปเลย
        if (unsavedCoins === 0 || !currentAccount) return;

        const pointsToSend = unsavedCoins;
        unsavedCoins = 0; // รีเซ็ตค่ารอไว้ก่อนเลย จะได้ไม่เบิ้ลเวลาผู้เล่นกดรัวๆ ระหว่างรอ API

        try {
            const response = await fetch("https://aegiscoin-backend.onrender.com/api/update-score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wallet_address: currentAccount,
                    points: pointsToSend
                }),
                keepalive: true //สำคัญ: บังคับให้เบราว์เซอร์ส่งข้อมูลให้จบแม้ผู้เล่นจะกดปิดหน้าเว็บไปแล้ว
            });

            const data = await response.json();
            if (data.status !== "success") {
                // ถ้าเซิร์ฟเวอร์มีปัญหา ให้เอาคะแนนที่ส่งไม่สำเร็จ กลับมาบวกคืนรอส่งรอบหน้า
                unsavedCoins += pointsToSend;
            }
        } catch (error) {
            console.error("Sync Error:", error);
            unsavedCoins += pointsToSend; // คืนคะแนนกลับมา
        }
    }
    // ตั้งเวลาให้ Auto-Save ทำงานทุกๆ 10 วินาที 
    setInterval(syncScoreToBackend, 10000);

    // ดักจับเหตุการณ์ตอนผู้เล่นกด "ปิดแท็บ" หรือ "รีเฟรช" เพื่อส่งคะแนนสุดท้าย
    window.addEventListener("beforeunload", () => {
        if (unsavedCoins > 0) {
            syncScoreToBackend();
        }
    });
    // ==========================================
    // 4. WEB3 & METAMASK INTEGRATION (ระบบกระเป๋าเงิน)
    // ==========================================


    function updateWalletUI(accounts) {
        if (!accounts || accounts.length === 0) {
            // กรณีไม่มีกระเป๋า หรือตัดการเชื่อมต่อ
            currentAccount = null;
            btnConnect.innerText = "Connect Wallet";
            warning.style.display = "block"

            btnPlay.disabled = false;
            // ล็อกปุ่ม
            btnPlay.disabled = true;
            btnVault.disabled = true;
            return;
        }

        // กรณีเชื่อมต่อสำเร็จ
        currentAccount = accounts[0];
        lobbyCoinBox.style.display = "block";
        btnConnect.innerText = currentAccount.substring(0, 6) + "..." + currentAccount.substring(currentAccount.length - 4);

        btnDemo.disabled = true
            // ปลดล็อกปุ่มให้ใช้งานได้

        btnPlay.disabled = false;
        btnVault.disabled = false;
    }

    async function connectWallet() {
        if (!window.ethereum) {
            alert("ไม่พบกระเป๋า MetaMask กรุณาติดตั้งที่ metamask.io");
            return;
        }
        try {
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            updateWalletUI(accounts);
            if (currentAccount) {
                await loadPlayerScore(currentAccount);

            }
        } catch (err) {
            if (err.code === 4001) {
                console.log("ผู้เล่นกดปฏิเสธการเชื่อมต่อ");
            } else {
                console.error(err);
            }
        }
    }

    btnConnect.addEventListener("click", connectWallet);
    // ตรวจสอบสถานะเดิมเมื่อโหลดหน้าเว็บขึ้นมา
    if (window.ethereum) {
        // ------------------------------------------
        // 1. ตรวจสอบสถานะเดิมตอนโหลด/รีเฟรชหน้าเว็บ (Auto-Connect)
        // ------------------------------------------
        // ดึงรายการ accounts ที่เคยเชื่อมต่อค้างไว้ (ถ้าผู้เล่นเคยกด Connect แล้ว มันจะไม่เด้ง Popup ป๊อบอัพถามซ้ำ)
        window.ethereum.request({ method: "eth_accounts" })
            .then(async(accounts) => {
                if (accounts.length > 0) {
                    console.log("พบกระเป๋าเดิมที่เคยเชื่อมต่อไว้:", accounts[0]);

                    // อัปเดต UI หน้าเว็บ (เปิดปุ่ม Play/Vault, โชว์เลขกระเป๋าย่อ)
                    updateWalletUI(accounts);
                    // โหลดแต้มของผู้เล่นคนนี้จาก Database มาแสดงบนหน้าจอ
                    await loadPlayerScore(accounts[0]);
                } else {
                    // ถ้าไม่มีกระเป๋าค้างไว้ สั่งรีเซ็ตเป็น 0 และล็อกปุ่มตามปกติ
                    coins = 0;
                    lobbyCoins.innerText = coins
                    coinCount.inert = coins
                    vaultBalanceDisplay.innerText = coins;
                    updateWalletUI([]);
                }
            })
            .catch((err) => console.error("เกิดข้อผิดพลาดในการดึงข้อมูล eth_accounts:", err));

        // ------------------------------------------
        // 2. ดักฟังการสลับกระเป๋า หรือการกด Disconnect
        // ------------------------------------------

        // Event นี้จะทำงานทันทีเมื่อผู้เล่นกดสลับ Account หรือกดตัดการเชื่อมต่อใน MetaMask
        window.ethereum.on("accountsChanged", async(accounts) => {

            // กรณีที่ 2.1: ผู้เล่นกด Disconnect (accounts กลายเป็นอาร์เรย์ว่าง [])
            if (!accounts || accounts.length === 0) {
                window.location.reload();
                console.log("ผู้เล่นกดตัดการเชื่อมต่อจาก MetaMask");


                // กรณีที่ 2.2: ผู้เล่นสลับไปใช้กระเป๋าใบอื่นใน MetaMask
            } else {
                console.log("ผู้เล่นสลับกระเป๋าเป็น:", accounts[0]);

                // อัปเดต UI ปุ่มและแสดงเลขกระเป๋าใหม่
                updateWalletUI(accounts);
                // ดึงแต้มของกระเป๋าใบใหม่จาก Database มาโชว์ทันที
                await loadPlayerScore(accounts[0]);
                window.location.reload();

            }
        });
        // ------------------------------------------
        // 3. ดักฟังการสลับ Network (เช่น เปลี่ยนจาก Sepolia ไป Mainnet)
        // ------------------------------------------
        // Event นี้จะทำงานเมื่อผู้เล่นสลับเชนใน MetaMask
        window.ethereum.on("chainChanged", () => {
            console.log("ผู้เล่นทำการสลับ Network -> บังคับรีเฟรชหน้าเว็บ");

            // บังคับรีเฟรชหน้าเว็บ 1 รอบ เพื่อล้าง Web3 Provider เดิม ป้องกัน RPC และ Signer ค้าง
            window.location.reload();
        });

    } else {
        // กรณีที่เบราว์เซอร์ไม่มี MetaMask ติดตั้งไว้
        console.warn("ไม่พบ Web3 Provider (MetaMask) ในเบราว์เซอร์นี้");
    }
});