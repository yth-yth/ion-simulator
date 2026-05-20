/**
 * 基于纯二能级(Qubit)的 729nm 激光控制与等效光抽运模拟器 (JavaScript 移植版)
 * 采用 RK4 算法直接数值积分 Lindblad 主方程，无需后端 Python/QuTiP 支持
 */
class Simulator729nm {
    constructor(para = {}) {
        this.reset_para(para);
        // c_ops 等效衰减率
        this.gamma_pump = 0.0;
        this.gamma_dephase = 0.0;
    }

    reset_para(para) {
        this.para = para || {};
        // 729nm 激光控制参数
        this.para.omega_729 = this.para.omega_729 || 0.0;
        this.para.delta_729 = this.para.delta_729 || 0.0;
        this.para.phi_729 = this.para.phi_729 || 0.0;
        
        this.para.max_t = this.para.max_t || 1.0;
        this.para.npoints = this.para.npoints || 100;
    }

    /**
     * 发射激光序列操作
     * 729nm 激光通过拉比频率(omega)控制耦合强度
     */
    fire_laser(laser_name, omega = 1.0, phase = 0.0, detuning = 0.0) {
        this.para.omega_729 = 0.0;
        this.gamma_pump = 0.0;
        this.gamma_dephase = 0.0;

        if (laser_name === '729nm') {
            // 1. 729nm 激光驱动：相干演化 (产生拉比振荡)
            this.para.omega_729 = omega;
            this.para.delta_729 = detuning;
            this.para.phi_729 = phase;
            
        } else if (laser_name === '397nm_sigma_plus') {
            // 2. 等效光抽运：强制向 |0> 态坍缩
            this.gamma_pump = omega * 5.0; 
            
        } else if (laser_name === '397nm_sigma_minus') {
            // 3. 等效光散射：引发纯退相干 (Dephasing)
            this.gamma_dephase = omega * 5.0; 
            
        } else if (laser_name === 'off') {
            // 关闭所有作用，自由演化
        } else {
            console.error(`未知的操作: ${laser_name}`);
        }
    }

    /**
     * 获取密度矩阵的时间导数，用于 ODE 求解
     * 状态向量 y = [rho00, rho11, Re(rho01), Im(rho01)]
     */
    _derivative(t, y) {
        const [rho00, rho11, R, I] = y;
        
        // 含时哈密顿量分量 h(t) = 0.5 * Omega * exp(i(delta*t + phi))
        const phase = this.para.delta_729 * t + this.para.phi_729;
        const h_R = 0.5 * this.para.omega_729 * Math.cos(phase);
        const h_I = 0.5 * this.para.omega_729 * Math.sin(phase);

        // Lindblad 主方程求导计算
        const drho00 = 2 * h_I * R - 2 * h_R * I + this.gamma_pump * rho11;
        const drho11 = -2 * h_I * R + 2 * h_R * I - this.gamma_pump * rho11;
        const dR = h_I * (rho11 - rho00) - (0.5 * this.gamma_pump + 2 * this.gamma_dephase) * R;
        const dI = -h_R * (rho11 - rho00) - (0.5 * this.gamma_pump + 2 * this.gamma_dephase) * I;

        return [drho00, drho11, dR, dI];
    }

    /**
     * 使用 4阶龙格-库塔法 (RK4) 积分状态
     */
    calc(init_state = 'g1', t0 = 0) {
        let state;
        if (init_state === 'g1') state = [1.0, 0.0, 0.0, 0.0];
        else if (init_state === 'g2') state = [0.0, 1.0, 0.0, 0.0];
        else state = [...init_state]; // 假设传入的是 [rho00, rho11, Re, Im] 数组

        const tlist = [];
        const dt = this.para.max_t / (this.para.npoints - 1);
        
        const results = {
            t: [], P_g1: [], P_g2: [], states: [],
            bx: [], by: [], bz: [] // 为 UI 额外生成布洛赫球三维坐标
        };

        let current_y = state;
        let current_t = t0;

        for (let i = 0; i < this.para.npoints; i++) {
            results.t.push(current_t);
            results.P_g1.push(current_y[0]);
            results.P_g2.push(current_y[1]);
            results.states.push([...current_y]);
            
            // 转换至 Bloch 矢量系
            results.bx.push(2 * current_y[2]);
            results.by.push(-2 * current_y[3]);
            results.bz.push(current_y[0] - current_y[1]);

            if (i < this.para.npoints - 1) {
                // RK4 积分步骤
                const k1 = this._derivative(current_t, current_y);
                const y2 = current_y.map((v, idx) => v + 0.5 * dt * k1[idx]);
                const k2 = this._derivative(current_t + 0.5 * dt, y2);
                const y3 = current_y.map((v, idx) => v + 0.5 * dt * k2[idx]);
                const k3 = this._derivative(current_t + 0.5 * dt, y3);
                const y4 = current_y.map((v, idx) => v + dt * k3[idx]);
                const k4 = this._derivative(current_t + dt, y4);

                current_y = current_y.map((v, idx) => v + (dt / 6.0) * (k1[idx] + 2*k2[idx] + 2*k3[idx] + k4[idx]));
                current_t += dt;
            }
        }
        return results;
    }

    /**
     * 执行由多个操作步骤组成的激光序列
     */
    run_sequence(sequence, init_state = 'g1', pts_per_us = 100) {
        let current_state = (init_state === 'g1') ? [1.0, 0.0, 0.0, 0.0] : 
                           (init_state === 'g2') ? [0.0, 1.0, 0.0, 0.0] : init_state;
            
        let current_time = 0.0;
        const stitched_results = { t: [], P_g1: [], P_g2: [], states: [], bx: [], by: [], bz: [] };
        
        console.log("\n=======================================================");
        console.log("🚀 开始执行 729nm 激光量子比特脉冲序列...");
        
        sequence.forEach((step, idx) => {
            const laser_name = step.laser || 'off';
            const duration = step.duration || 1.0;
            const omega = step.omega !== undefined ? step.omega : 1.0;
            const phase = step.phase || 0.0;
            const detuning = step.detuning || 0.0;
            
            console.log(`步骤 ${idx+1}: [${laser_name.padEnd(18, ' ')}] 持续 ${duration.toFixed(2)} us | Omega=${omega.toFixed(2)}`);
            
            this.fire_laser(laser_name, omega, phase, detuning);
            this.para.max_t = duration;
            this.para.npoints = Math.max(2, Math.floor(duration * pts_per_us));
            
            const res = this.calc(current_state, current_time);
            
            // 拼接数据时避免时间点重复叠加
            const slice_idx = idx > 0 ? 1 : 0; 
            for (let key in stitched_results) {
                stitched_results[key].push(...res[key].slice(slice_idx));
            }
                
            current_time += duration;
            current_state = res.states[res.states.length - 1]; 
        });
            
        console.log("=======================================================");
        console.log(`✅ 执行完毕！总耗时: ${current_time.toFixed(4)} us\n`);
        
        return stitched_results;
    }
}

// ===================== 使用示例 =====================
/*
const sim = new Simulator729nm();

// 定义包含多个激光脉冲的序列
const mySequence = [
    { laser: '729nm', duration: 1.0, omega: 1.57, detuning: 0, phase: 0 },         // π/2 脉冲
    { laser: 'off', duration: 2.0 },                                               // 自由演化
    { laser: '397nm_sigma_minus', duration: 1.5, omega: 0.2 },                     // 施加退相干噪声
    { laser: '729nm', duration: 1.0, omega: 1.57, detuning: 0, phase: Math.PI }    // 相位反转脉冲
];

// 运行仿真并获取结果
const result = sim.run_sequence(mySequence, 'g1');

// 此时 result.P_g1 包含所有时间点的布居数数据
// 并且 result.bx, result.by, result.bz 包含了可直接塞入三维布洛赫球坐标系的数据！
*/